/**
 * Read what was dropped as a tree: plain files and whole folders, with each
 * file's folder relative to the drop. A dropped folder never shows the
 * browser's "upload all files?" prompt (only `<input webkitdirectory>` does),
 * so a drop is the prompt-free way to upload a folder.
 *
 * Framework-free and DOM-light on purpose: the entry walk is tested with
 * plain objects in `drop-tree.test.ts`.
 */

/** A file and the folder it sits in, relative to the drop (`''` = the top). */
export interface TreeFile {
  file: File;
  dir: string;
}

/** The members of `FileSystemEntry` this reads. */
export interface DroppedEntry {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file?: (ok: (file: File) => void, fail: (err: unknown) => void) => void;
  createReader?: () => { readEntries: (ok: (entries: DroppedEntry[]) => void, fail: (err: unknown) => void) => void };
}

/**
 * The dropped entries. Read inside the drop event: a `DataTransfer` is
 * emptied once the handler returns, so this must run before any `await`.
 */
export function droppedEntries(dataTransfer: DataTransfer): DroppedEntry[] {
  const entries: DroppedEntry[] = [];
  for (const item of Array.from(dataTransfer.items ?? [])) {
    if (item.kind !== 'file') continue;
    const entry = item.webkitGetAsEntry?.() as DroppedEntry | null | undefined;
    if (entry) entries.push(entry);
  }
  return entries;
}

export function hasFolder(entries: readonly DroppedEntry[]): boolean {
  return entries.some((e) => e.isDirectory);
}

/** Every file under `entries`, depth first, each with its folder path. */
export async function readDroppedTree(entries: readonly DroppedEntry[]): Promise<TreeFile[]> {
  const out: TreeFile[] = [];
  const walk = async (entry: DroppedEntry, dir: string): Promise<void> => {
    if (entry.isFile && entry.file) {
      out.push({ file: await new Promise<File>((ok, fail) => entry.file!(ok, fail)), dir });
      return;
    }
    if (!entry.isDirectory || !entry.createReader) return;
    const here = dir ? `${dir}/${entry.name}` : entry.name;
    const reader = entry.createReader();
    // `readEntries` answers in pages (100 in Chromium) until it answers none.
    for (;;) {
      const page = await new Promise<DroppedEntry[]>((ok, fail) => reader.readEntries(ok, fail));
      if (page.length === 0) break;
      for (const child of page) await walk(child, here);
    }
  };
  for (const entry of entries) await walk(entry, '');
  return out;
}

/** Folders to create for `items`, grouped by depth: each level only after its parents. */
export function treeLevels(items: readonly TreeFile[]): string[][] {
  const levels: Set<string>[] = [];
  for (const { dir } of items) {
    const parts = dir.split('/').filter(Boolean);
    parts.forEach((_, depth) => {
      (levels[depth] ??= new Set()).add(parts.slice(0, depth + 1).join('/'));
    });
  }
  return levels.map((level) => [...level]);
}

/**
 * Make the folders of an uploading tree on demand: `ensure(rel)` resolves once
 * `rel` and every parent above it exist. Each folder is asked for once, so a
 * file waits only on its own folder and the upload starts with the first one
 * made, not after the whole tree. A folder already there (409) counts as
 * made. A failure is not kept: the next ask (a Retry) tries again.
 * `''` is the folder the tree lands in, which already exists.
 */
export function folderMaker(mkdir: (rel: string) => Promise<unknown>): (rel: string) => Promise<void> {
  const made = new Map<string, Promise<void>>();
  const ensure = (rel: string): Promise<void> => {
    if (!rel) return Promise.resolve();
    const known = made.get(rel);
    if (known) return known;
    const parent = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
    const run = ensure(parent)
      .then(() => mkdir(rel))
      .then(
        () => undefined,
        (err: unknown) => {
          if ((err as { status?: number } | null)?.status === 409) return;
          made.delete(rel);
          throw err;
        },
      );
    made.set(rel, run);
    return run;
  };
  return ensure;
}
