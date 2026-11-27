import { createRoute, z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { normalizeDrivePath } from '../../drives/access';
import { assertDriveFilesFit, assertDriveWriteFits, forgetDriveUsage } from '../../drives/limits';
import { noteDriveWrite } from '../../drives/conflicts';
import {
  type DriveRow,
  type RecordedDriveMount,
  authorizedSyncMounts,
  driveVolume,
  getDrive,
  openVolumeFor,
  readDriveVolume,
  sessionDriveNotes,
  writeDriveVolume,
} from '../../drives/service';
import { isDriveSyncBox, syncMountAllows, syncVersionToken, withSyncPathLock } from '../../drives/sync';
import {
  type UploadPlanRecord,
  forgetUploadPlan,
  liveSessionSandbox,
  rememberUploadPlan,
  uploadPlans,
} from '../../drives/sync-store';
import {
  DriveStorageError,
  commitVolumeUpload,
  driveVolumeHead,
  isKortixInternalPath,
  listVolumeFilesPage,
  moveVolumeFile,
  planVolumeUpload,
  putVolumeUploadBlock,
  readVolumeFile,
  removeVolumeFile,
  statVolumeFile,
  writeVolumeFile,
} from '../../drives/volumes';
import { isSessionSandboxCredential } from '../../middleware/session-sandbox-credential';
import { isUuid } from '../../shared/validate';
import { logger } from '../../lib/logger';
import { auth, errors, json, queryText } from '../../openapi';
import { projectsApp } from '../lib/app';

// Drive sync: the file calls a session box's daemon makes to keep the drives
// it was given in sync when it runs off Platinum (see drives/sync.ts). Only
// the session's own sandbox credential reaches them, only while the sandbox
// is live, only for the drives recorded on its row, only inside the folder
// each one covers, and a write only through a read-write drive. The box never
// sees the storage credential: these routes call storage for it.
//
// What a sandbox recorded is not the last word: while a revocation has not
// reached its mounts (drives/service.ts authorizedSyncMounts), only what the
// session may use now is honored. A block upload is authorized by the paths
// its plan named, kept on the sandbox row, and every one is checked again at
// each block and at the commit.

const MAX_PUT_BYTES = 64 * 1024 * 1024;
const BLOCK_BYTES = 1024 * 1024;

type Ctx = Context<any>;

const param = (c: Ctx, name: string): string => c.req.param(name) ?? '';

interface SyncScope {
  sandboxId: string;
  accountId: string;
  mounts: RecordedDriveMount[];
  synced: boolean;
  uploads: Record<string, UploadPlanRecord>;
}

function refuse(c: Ctx, status: 400 | 403 | 404 | 413, error: string): Response {
  return c.json({ error }, status);
}

/** The session box calling, or a refusal. */
async function scopeOf(c: Ctx): Promise<SyncScope | Response> {
  const projectId = param(c, 'workspaceId');
  const sessionId = param(c, 'sessionId');
  if (!isUuid(sessionId) || !isSessionSandboxCredential(c) || c.get('sessionId') !== sessionId) {
    return refuse(c, 403, 'Drive sync takes the session sandbox credential');
  }
  const accountId = c.get('accountId') as string | undefined;
  if (!accountId) return refuse(c, 403, 'Drive sync takes the session sandbox credential');
  const row = await liveSessionSandbox({ sessionId, projectId, accountId });
  if (!row) return refuse(c, 403, 'The session sandbox is not live');
  return {
    sandboxId: row.sandboxId,
    accountId,
    mounts: await authorizedSyncMounts({ ...row, accountId }),
    synced: isDriveSyncBox(row),
    uploads: uploadPlans(row.metadata),
  };
}

/** The drive and the checked path, or a refusal. Drives not given to the session read as missing. */
async function driveFor(
  c: Ctx,
  need: 'read' | 'write',
  rawPath: string | undefined,
): Promise<{ drive: DriveRow; path: string } | Response> {
  const scope = await scopeOf(c);
  if (scope instanceof Response) return scope;
  if (!scope.synced) return refuse(c, 404, 'This session mounts its drives; there is nothing to sync');
  const driveId = param(c, 'driveId');
  const path = normalizeDrivePath(rawPath);
  if (!path) return refuse(c, 400, 'Invalid path');
  if (!isUuid(driveId) || !syncMountAllows(scope.mounts, driveId, path, 'read')) {
    return refuse(c, 404, 'Drive not found');
  }
  if (need === 'write' && !syncMountAllows(scope.mounts, driveId, path, 'write')) {
    return refuse(c, 403, 'This drive is read-only in this session');
  }
  const drive = await getDrive(driveId);
  if (!drive || drive.accountId !== scope.accountId) return refuse(c, 404, 'Drive not found');
  return { drive, path };
}

async function storage<T>(c: Ctx, op: () => Promise<T>): Promise<T | Response> {
  try {
    return await op();
  } catch (err) {
    if (err instanceof DriveStorageError) {
      if (err.retryAfterSeconds !== undefined) c.header('Retry-After', String(err.retryAfterSeconds));
      return c.json({ error: err.message, code: err.code, ...(err.detail ?? {}) }, err.status);
    }
    throw err;
  }
}

/** The size of the file a synced write replaces, 0 when there is none. */
async function syncedFileSize(drive: DriveRow, path: string): Promise<number> {
  return readDriveVolume(
    drive,
    async (volume) => {
      try {
        const st = await statVolumeFile(volume, path);
        return st.type === 'file' ? st.size : 0;
      } catch (err) {
        if (err instanceof DriveStorageError && err.status === 404) return 0;
        throw err;
      }
    },
    () => 0,
  );
}

const notFound = (): never => {
  throw new DriveStorageError(404, 'File or folder not found', 'path_not_found');
};

const SessionParams = z.object({ workspaceId: z.string(), sessionId: z.string() });
const DriveParams = SessionParams.extend({ driveId: z.string() });
const UploadParams = DriveParams.extend({ uploadId: z.string() });
const AnyObject = z.record(z.string(), z.unknown());
const MountsSchema = z.object({
  ready: z.boolean(),
  mounts: z.array(
    z.object({
      driveId: z.string(),
      name: z.string(),
      mountPath: z.string(),
      readOnly: z.boolean(),
      subdir: z.string().optional(),
    }),
  ),
  notes: z.string().nullable(),
});
const FilesPageSchema = z.object({ entries: z.array(AnyObject), next_cursor: z.string().nullable() });

/**
 * These handlers answer through `refuse` and `storage`, whose statuses are
 * decided at run time, so they return a plain `Response`: the route config
 * documents the answers, and this keeps the typed-response check off them.
 */
const plainResponses = (handler: (c: Ctx) => Promise<Response>) => handler as (c: Ctx) => Promise<never>;

const REMOTE_CHANGED = Symbol('remote_changed');

function remoteChanged(c: Ctx): Response {
  return c.json({ error: 'The file changed on the drive since this box last read it', code: 'remote_changed' }, 409);
}

/**
 * The write, only when the drive's file is still the version the box based
 * its change on (`expect`: "size:mtime" or "absent"). Checked and written
 * under a per-path lock (drives/sync.ts withSyncPathLock, which documents
 * what it cannot cover). Without `expect` the write is unconditional.
 */
async function conditionalWrite<T>(
  drive: DriveRow,
  path: string,
  expect: string | undefined,
  write: () => Promise<T>,
): Promise<T | typeof REMOTE_CHANGED> {
  if (!expect) return write();
  return withSyncPathLock(drive.driveId, path, async () => {
    const current = await readDriveVolume(
      drive,
      (volume) =>
        statVolumeFile(volume, path).catch((err) => {
          if (err instanceof DriveStorageError && err.status === 404) return null;
          throw err;
        }),
      () => null,
    );
    if (syncVersionToken(current) !== expect) return REMOTE_CHANGED;
    return write();
  });
}

/**
 * The block upload this box planned on this drive, with every path it writes
 * checked again against what the session may write now: a mount turned
 * read-only, or a folder taken away, since the plan refuses its blocks and its commit.
 */
async function planFor(c: Ctx): Promise<{ scope: SyncScope; drive: DriveRow; plan: UploadPlanRecord } | Response> {
  const scope = await scopeOf(c);
  if (scope instanceof Response) return scope;
  const driveId = param(c, 'driveId');
  const plan = scope.uploads[param(c, 'uploadId')];
  if (!scope.synced || !isUuid(driveId) || !plan || plan.driveId !== driveId) {
    return refuse(c, 404, 'Upload not found');
  }
  for (const path of plan.paths) {
    if (!syncMountAllows(scope.mounts, driveId, path, 'write')) {
      return refuse(c, 403, 'This drive is read-only in this session');
    }
  }
  const drive = await getDrive(driveId);
  if (!drive || drive.accountId !== scope.accountId) return refuse(c, 404, 'Drive not found');
  return { scope, drive, plan };
}

export function registerSessionDriveSyncRoutes(): void {
  // The drives to sync and where; `ready` stays false until the boot recorded them.
  projectsApp.openapi(
    createRoute({
      method: 'get',
      path: '/{workspaceId}/sessions/{sessionId}/drive-sync/mounts',
      operationId: 'sessions.drive_sync.mounts.list',
      'x-kortix-action': 'none',
      'x-kortix-exposure': 'internal',
      tags: ['sessions'],
      summary: 'List the drives a session box keeps in sync',
      description:
        "`ready` stays false until the box's boot recorded its drives. Only what the session may use now is listed.",
      ...auth,
      request: { params: SessionParams },
      responses: { 200: json(MountsSchema, 'The drives to sync and where'), ...errors(403) },
    }),
    plainResponses(async (c: Ctx) => {
      const scope = await scopeOf(c);
      if (scope instanceof Response) return scope;
      if (!scope.synced) return c.json({ ready: false, mounts: [], notes: null });
      const { mounts: recorded, text } = await sessionDriveNotes(param(c, 'sessionId'));
      // Only what the session may use now: a revoked folder leaves the box's sync at once.
      const mounts = recorded.flatMap((m) => {
        const allowed = scope.mounts.find((a) => a.mountPath === m.mountPath);
        return allowed ? [{ ...m, readOnly: allowed.readOnly }] : [];
      });
      return c.json({
        ready: true,
        mounts: mounts.map((m) => ({
          driveId: m.driveId,
          name: m.name,
          mountPath: m.mountPath,
          readOnly: m.readOnly,
          ...(m.subdir ? { subdir: m.subdir } : {}),
        })),
        notes: text,
      });
    }),
  );

  // The drive's head commit: the daemon lists the drive again only when it moved.
  projectsApp.openapi(
    createRoute({
      method: 'get',
      path: '/{workspaceId}/sessions/{sessionId}/drive-sync/{driveId}/head',
      operationId: 'sessions.drive_sync.head.get',
      'x-kortix-action': 'none',
      'x-kortix-exposure': 'internal',
      tags: ['sessions'],
      summary: 'Read the head commit of a synced drive',
      description:
        'The daemon lists the drive again only when the head moved.',
      ...auth,
      request: { params: DriveParams },
      responses: { 200: json(z.object({ head: z.string().nullable() }), 'The head commit'), ...errors(400, 403, 404, 409, 413, 422, 429, 503) },
    }),
    plainResponses(async (c: Ctx) => {
      // Any folder of the drive mounted here may ask: the head is the drive's, not a folder's.
      const mounted = await scopeOf(c);
      if (mounted instanceof Response) return mounted;
      const mount = mounted.synced ? mounted.mounts.find((m) => m.driveId === param(c, 'driveId')) : undefined;
      const got = await driveFor(c, 'read', mount?.subdir ?? '/');
      if (got instanceof Response) return got;
      const head = await storage(c, () =>
        readDriveVolume(got.drive, (volume) => driveVolumeHead(volume).then((h) => h.token), () => null),
      );
      if (head instanceof Response) return head;
      return c.json({ head });
    }),
  );

  projectsApp.openapi(
    createRoute({
      method: 'get',
      path: '/{workspaceId}/sessions/{sessionId}/drive-sync/{driveId}/files',
      operationId: 'sessions.drive_sync.files.list',
      'x-kortix-action': 'none',
      'x-kortix-exposure': 'internal',
      tags: ['sessions'],
      summary: 'List a folder of a synced drive',
      description:
        "One page; `recursive=true` lists the whole tree under `path`. Kortix's own bookkeeping files are left out.",
      ...auth,
      request: { params: DriveParams, query: z.object({ path: queryText('Folder path'), recursive: queryText('`true`: the whole tree'), cursor: queryText('The `next_cursor` of the previous page') }) },
      responses: { 200: json(FilesPageSchema, 'A page of entries'), ...errors(400, 403, 404, 409, 413, 422, 429, 503) },
    }),
    plainResponses(async (c: Ctx) => {
      const got = await driveFor(c, 'read', c.req.query('path'));
      if (got instanceof Response) return got;
      const page = await storage(c, () =>
        readDriveVolume(
          got.drive,
          (volume) =>
            listVolumeFilesPage(volume, got.path, {
              recursive: c.req.query('recursive') === 'true',
              cursor: c.req.query('cursor') || undefined,
            }),
          () => ({ entries: [], next_cursor: null }),
        ),
      );
      if (page instanceof Response) return page;
      // Kortix's own bookkeeping (staging of a shared upload, fold markers) never syncs into a box.
      return c.json({ ...page, entries: page.entries.filter((e) => !isKortixInternalPath(e.path)) });
    }),
  );

  projectsApp.openapi(
    createRoute({
      method: 'get',
      path: '/{workspaceId}/sessions/{sessionId}/drive-sync/{driveId}/files/stat',
      operationId: 'sessions.drive_sync.files.stat',
      'x-kortix-action': 'none',
      'x-kortix-exposure': 'internal',
      tags: ['sessions'],
      summary: 'Read the metadata of a file of a synced drive',
      ...auth,
      request: { params: DriveParams, query: z.object({ path: queryText('File path') }) },
      responses: { 200: json(AnyObject, 'The file metadata'), ...errors(400, 403, 404, 409, 413, 422, 429, 503) },
    }),
    plainResponses(async (c: Ctx) => {
      const got = await driveFor(c, 'read', c.req.query('path'));
      if (got instanceof Response) return got;
      const st = await storage(c, () => readDriveVolume(got.drive, (volume) => statVolumeFile(volume, got.path), notFound));
      if (st instanceof Response) return st;
      return c.json(st);
    }),
  );

  projectsApp.openapi(
    createRoute({
      method: 'get',
      path: '/{workspaceId}/sessions/{sessionId}/drive-sync/{driveId}/files/content',
      operationId: 'sessions.drive_sync.files.content.get',
      'x-kortix-action': 'none',
      'x-kortix-exposure': 'internal',
      tags: ['sessions'],
      summary: 'Download a file of a synced drive',
      description:
        'Raw bytes. Honors `Range`.',
      ...auth,
      request: { params: DriveParams, query: z.object({ path: queryText('File path') }) },
      responses: { 200: { description: 'File bytes', content: { 'application/octet-stream': { schema: z.any() } } }, 206: { description: 'Partial file bytes', content: { 'application/octet-stream': { schema: z.any() } } }, ...errors(400, 403, 404, 409, 413, 422, 429, 503) },
    }),
    plainResponses(async (c: Ctx) => {
      const got = await driveFor(c, 'read', c.req.query('path'));
      if (got instanceof Response) return got;
      const upstream = await storage(c, () =>
        readDriveVolume(got.drive, (volume) => readVolumeFile(volume, got.path, c.req.header('range') ?? undefined), notFound),
      );
      if (upstream instanceof Response && !upstream.ok) return upstream;
      const res = upstream as Response;
      const headers = new Headers({ 'content-type': 'application/octet-stream', 'cache-control': 'private, no-store' });
      for (const h of ['content-length', 'content-range', 'etag', 'accept-ranges', 'x-pt-content-length']) {
        const value = res.headers.get(h);
        if (value) headers.set(h, value);
      }
      return new Response(res.body, { status: res.status === 206 ? 206 : 200, headers });
    }),
  );

  projectsApp.openapi(
    createRoute({
      method: 'put',
      path: '/{workspaceId}/sessions/{sessionId}/drive-sync/{driveId}/files/content',
      operationId: 'sessions.drive_sync.files.content.set',
      'x-kortix-action': 'none',
      'x-kortix-exposure': 'internal',
      tags: ['sessions'],
      summary: 'Write a file of a synced drive',
      description:
        'Raw request body, at most 64 MiB (larger files take the block upload). `expect` (`size:mtime` or `absent`): the version the box based its change on; a change on the drive since then answers 409 `remote_changed`.',
      ...auth,
      request: { params: DriveParams, query: z.object({ path: queryText('File path'), expect: queryText('The version the change is based on') }) },
      responses: { 200: json(AnyObject, 'The written file'), ...errors(400, 403, 404, 409, 413, 422, 429, 503) },
    }),
    plainResponses(async (c: Ctx) => {
      const got = await driveFor(c, 'write', c.req.query('path'));
      if (got instanceof Response) return got;
      if (got.path === '/') return refuse(c, 400, 'Invalid path');
      const declared = Number(c.req.header('content-length') ?? NaN);
      if (Number.isFinite(declared) && declared > MAX_PUT_BYTES) return refuse(c, 413, 'Use the block upload for files this large');
      const body = new Uint8Array(await c.req.arrayBuffer());
      if (body.byteLength > MAX_PUT_BYTES) return refuse(c, 413, 'Use the block upload for files this large');
      // The same Files limits as a write from Files (drives/limits.ts).
      const fits = await storage(c, () => assertDriveWriteFits(got.drive, { bytes: body.byteLength, replaces: () => syncedFileSize(got.drive, got.path) }));
      if (fits instanceof Response) return fits;
      const written = await storage(c, () =>
        conditionalWrite(got.drive, got.path, c.req.query('expect'), () =>
          writeDriveVolume(got.drive, (volume) => writeVolumeFile(volume, got.path, body, { overwrite: true })),
        ),
      );
      if (written instanceof Response) return written;
      if (written === REMOTE_CHANGED) return remoteChanged(c);
      const { commit: _commit, ...file } = written;
      noteDriveWrite(got.drive.driveId);
      forgetDriveUsage(got.drive.platinumVolumeName);
      return c.json(file);
    }),
  );

  // Block upload, for large files: plan names every file it writes, each must be writable.
  projectsApp.openapi(
    createRoute({
      method: 'post',
      path: '/{workspaceId}/sessions/{sessionId}/drive-sync/{driveId}/files/upload',
      operationId: 'sessions.drive_sync.files.upload.create',
      'x-kortix-action': 'none',
      'x-kortix-exposure': 'internal',
      tags: ['sessions'],
      summary: 'Plan a block upload to a synced drive',
      description:
        "JSON body `{ files: [{ path, size, blocks }] }`: every file the upload writes, each writable in this session and within the Files limits. Answers storage's plan, with the upload id.",
      ...auth,
      request: { params: DriveParams },
      responses: { 200: json(AnyObject, 'The upload plan'), ...errors(400, 403, 404, 409, 413, 422, 429, 503) },
    }),
    plainResponses(async (c: Ctx) => {
      const plan = (await c.req.json().catch(() => null)) as { files?: Array<{ path?: unknown }>; dirs?: unknown[] } | null;
      if (!plan || !Array.isArray(plan.files) || !plan.files.length || plan.dirs?.length) return refuse(c, 400, 'Invalid upload plan');
      let target: { drive: DriveRow; path: string } | null = null;
      for (const f of plan.files) {
        const got = await driveFor(c, 'write', typeof f?.path === 'string' ? f.path : undefined);
        if (got instanceof Response) return got;
        if (got.path === '/') return refuse(c, 400, 'Invalid path');
        f.path = got.path;
        target = got;
      }
      const drive = target!.drive;
      const scope = await scopeOf(c);
      if (scope instanceof Response) return scope;
      // The plan's files against the Files limits, before any block is sent.
      // One commit lands every file at once, so the plan's total is what must
      // fit, judged on what the drive holds now (not a cached figure). A file
      // with no size, or a size that is not a whole number of bytes, is refused:
      // the plan goes to storage whole either way.
      const sized = (plan.files as Array<{ path: string; size?: unknown }>).map((f) => ({
        path: f.path,
        bytes: typeof f.size === 'number' ? f.size : Number.NaN,
      }));
      const fits = await storage(c, () => assertDriveFilesFit(drive, sized, { overwrite: true }));
      if (fits instanceof Response) return fits;
      const r = await storage(c, async () => planVolumeUpload(await openVolumeFor(drive), { ...plan, overwrite: true }));
      if (r instanceof Response) return r;
      const uploadId = (r as { upload_id?: unknown }).upload_id;
      if (typeof uploadId !== 'string' || !uploadId) return refuse(c, 400, 'Invalid upload plan');
      await rememberUploadPlan(scope.sandboxId, uploadId, {
        driveId: drive.driveId,
        paths: plan.files.map((f) => f.path as string),
        at: new Date().toISOString(),
      });
      return c.json(r as Record<string, unknown>);
    }),
  );

  projectsApp.openapi(
    createRoute({
      method: 'put',
      path: '/{workspaceId}/sessions/{sessionId}/drive-sync/{driveId}/files/upload/{uploadId}/blocks/{sha}',
      operationId: 'sessions.drive_sync.files.upload.blocks.set',
      'x-kortix-action': 'none',
      'x-kortix-exposure': 'internal',
      tags: ['sessions'],
      summary: 'Send one block of a block upload to a synced drive',
      description:
        'Raw request body, at most 1 MiB; `sha` is its lowercase sha256. Only for an upload this box planned, while every path it writes is still writable.',
      ...auth,
      request: { params: UploadParams.extend({ sha: z.string() }) },
      responses: { 204: { description: 'Stored' }, ...errors(400, 403, 404, 409, 413, 422, 429, 503) },
    }),
    plainResponses(async (c: Ctx) => {
      // A block lands only for a plan this box made, while every path it writes is still writable.
      const planned = await planFor(c);
      if (planned instanceof Response) return planned;
      const { drive } = planned;
      const sha = param(c, 'sha');
      if (!/^[0-9a-f]{64}$/.test(sha)) return refuse(c, 400, 'Invalid block');
      const body = new Uint8Array(await c.req.arrayBuffer());
      if (body.byteLength > BLOCK_BYTES) return refuse(c, 413, 'A block is at most 1 MiB');
      const r = await storage(c, () => putVolumeUploadBlock(driveVolume(drive), param(c, 'uploadId'), sha, body));
      if (r instanceof Response) return r;
      return c.body(null, 204);
    }),
  );

  projectsApp.openapi(
    createRoute({
      method: 'post',
      path: '/{workspaceId}/sessions/{sessionId}/drive-sync/{driveId}/files/upload/{uploadId}/commit',
      operationId: 'sessions.drive_sync.files.upload.commit',
      'x-kortix-action': 'none',
      'x-kortix-exposure': 'internal',
      tags: ['sessions'],
      summary: 'Commit a block upload to a synced drive',
      description:
        '`path` + `expect`: the file the plan writes and the version it was based on; a change on the drive since then answers 409 `remote_changed`.',
      ...auth,
      request: { params: UploadParams, query: z.object({ path: queryText('File path the plan writes'), expect: queryText('The version the change is based on') }) },
      responses: { 200: json(AnyObject, 'The committed upload'), ...errors(400, 403, 404, 409, 413, 422, 429, 503) },
    }),
    plainResponses(async (c: Ctx) => {
      const planned = await planFor(c);
      if (planned instanceof Response) return planned;
      const { drive, plan, scope } = planned;
      // `path` + `expect`: the file the plan writes and the version it was based on.
      const target = c.req.query('path');
      let path: string | null = null;
      if (target !== undefined) {
        path = normalizeDrivePath(target);
        if (!path || !plan.paths.includes(path)) return refuse(c, 400, 'The upload plan does not write this path');
      }
      const uploadId = param(c, 'uploadId');
      const commit = () => commitVolumeUpload(driveVolume(drive), uploadId);
      const r = await storage(c, () =>
        path ? conditionalWrite(drive, path, c.req.query('expect'), commit) : commit(),
      );
      if (r instanceof Response) return r;
      if (r === REMOTE_CHANGED) return remoteChanged(c);
      await forgetUploadPlan(scope.sandboxId, uploadId).catch((err) =>
        logger.warn(`[drive-sync] forgetting upload ${uploadId} failed:`, { error: err instanceof Error ? err.message : String(err) }),
      );
      noteDriveWrite(drive.driveId);
      forgetDriveUsage(drive.platinumVolumeName);
      return c.json(r as Record<string, unknown>);
    }),
  );

  projectsApp.openapi(
    createRoute({
      method: 'post',
      path: '/{workspaceId}/sessions/{sessionId}/drive-sync/{driveId}/files/move',
      operationId: 'sessions.drive_sync.files.move',
      'x-kortix-action': 'none',
      'x-kortix-exposure': 'internal',
      tags: ['sessions'],
      summary: 'Move a file of a synced drive',
      description:
        'JSON body `{ src, dst }`: both paths writable in this session.',
      ...auth,
      request: { params: DriveParams },
      responses: { 200: json(z.object({ ok: z.boolean() }), 'Moved'), ...errors(400, 403, 404, 409, 413, 422, 429, 503) },
    }),
    plainResponses(async (c: Ctx) => {
      const body = (await c.req.json().catch(() => null)) as { src?: unknown; dst?: unknown } | null;
      const src = await driveFor(c, 'write', typeof body?.src === 'string' ? body.src : undefined);
      if (src instanceof Response) return src;
      const dst = await driveFor(c, 'write', typeof body?.dst === 'string' ? body.dst : undefined);
      if (dst instanceof Response) return dst;
      if (src.path === '/' || dst.path === '/') return refuse(c, 400, 'Invalid path');
      const r = await storage(c, () => writeDriveVolume(src.drive, (volume) => moveVolumeFile(volume, src.path, dst.path)));
      if (r instanceof Response) return r;
      noteDriveWrite(src.drive.driveId);
      return c.json({ ok: true });
    }),
  );

  projectsApp.openapi(
    createRoute({
      method: 'delete',
      path: '/{workspaceId}/sessions/{sessionId}/drive-sync/{driveId}/files',
      operationId: 'sessions.drive_sync.files.delete',
      'x-kortix-action': 'none',
      'x-kortix-exposure': 'internal',
      tags: ['sessions'],
      summary: 'Delete a file or folder of a synced drive',
      description:
        '`expect`: the version the box saw when it decided to delete; a change on the drive since then answers 409 `remote_changed`.',
      ...auth,
      request: { params: DriveParams, query: z.object({ path: queryText('File or folder path'), recursive: queryText('`true`: a folder with everything in it'), expect: queryText('The version the delete is based on') }) },
      responses: { 200: json(z.object({ ok: z.boolean() }), 'Deleted'), ...errors(400, 403, 404, 409, 413, 422, 429, 503) },
    }),
    plainResponses(async (c: Ctx) => {
      const got = await driveFor(c, 'write', c.req.query('path'));
      if (got instanceof Response) return got;
      if (got.path === '/') return refuse(c, 400, 'The drive root cannot be removed');
      // `expect`: the version the box saw when it decided to delete. A change on
      // the drive since then is kept: the delete answers 409 and the box pulls it back.
      const r = await storage(c, () =>
        conditionalWrite(got.drive, got.path, c.req.query('expect'), () =>
          readDriveVolume(got.drive, (volume) => removeVolumeFile(volume, got.path, c.req.query('recursive') === 'true'), () => undefined),
        ),
      );
      if (r instanceof Response) return r;
      if (r === REMOTE_CHANGED) return remoteChanged(c);
      noteDriveWrite(got.drive.driveId);
      return c.json({ ok: true });
    }),
  );
}
