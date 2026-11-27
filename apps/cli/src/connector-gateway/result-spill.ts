/**
 * Large connector results go to a file; the model gets a path and a summary.
 *
 * The agent harness (pi) truncates any tool output above 50 KB / 2000 lines
 * (`DEFAULT_MAX_BYTES` / `DEFAULT_MAX_LINES`, pi's `core/tools/truncate`) and
 * shows the model only part of it. A list query (a Linear GraphQL page, a CRM export) is
 * often larger, so the model received cut-off JSON and improvised. Saved as a
 * file, the result is worked through with jq or bun instead of read whole.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';

const MAX_DEPTH = 4;
const MAX_KEYS = 40;
const MAX_ITEM_KEYS = 30;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function keyList(value: Record<string, unknown>): string {
  const keys = Object.keys(value);
  return keys.length > MAX_ITEM_KEYS ? `${keys.slice(0, MAX_ITEM_KEYS).join(',')},…` : keys.join(',');
}

/**
 * A compact outline of a JSON value: object keys (up to MAX_KEYS, MAX_DEPTH
 * deep), `array(n) of {item keys}`, strings as `string`, numbers / booleans /
 * null verbatim, and every `pageInfo` verbatim so the next cursor is visible.
 */
export function jsonShape(value: unknown, depth = 0): unknown {
  if (Array.isArray(value)) {
    if (value.length === 0) return 'array(0)';
    const first = value[0];
    const item = isRecord(first)
      ? `{${keyList(first)}}`
      : Array.isArray(first)
        ? 'array'
        : first === null
          ? 'null'
          : typeof first;
    return `array(${value.length}) of ${item}`;
  }
  if (!isRecord(value)) return typeof value === 'string' ? 'string' : value;
  if (depth >= MAX_DEPTH) return `{${keyList(value)}}`;
  const entries = Object.entries(value);
  const shape: Record<string, unknown> = {};
  for (const [key, child] of entries.slice(0, MAX_KEYS)) {
    shape[key] = key === 'pageInfo' ? child : jsonShape(child, depth + 1);
  }
  if (entries.length > MAX_KEYS) shape['…'] = `${entries.length - MAX_KEYS} more keys`;
  return shape;
}

/**
 * Write `result` in full to `path` (parent dirs created) and return the call
 * envelope with `data` replaced by `saved_to`, `bytes`, and `shape` (of `data`).
 * The envelope keeps `ok`, `status`, `account`, `approval_url` and the rest.
 */
export async function saveResult(
  result: unknown,
  path: string,
): Promise<Record<string, unknown>> {
  const text = JSON.stringify(result, null, 2);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text);
  const { data, ...envelope } = isRecord(result) ? result : { data: result };
  return {
    ...envelope,
    saved_to: path,
    bytes: Buffer.byteLength(text),
    shape: jsonShape(isRecord(result) && !('data' in result) ? result : data),
  };
}

/**
 * A connector result that IS a file (a Kortix Browser screenshot): an
 * output with `data_base64` and `mime_type`. The bytes go to `path` (or a
 * new file under the temp dir, named by `file_name`), and the envelope keeps
 * everything else plus `saved_to` and `bytes`: base64 never reaches the
 * model. Null for any other result. `--out x.json` keeps the JSON instead.
 */
export async function saveFileOutput(result: unknown, path?: string): Promise<Record<string, unknown> | null> {
  if (!isRecord(result)) return null;
  // The HTTP route returns the tool's output as `output`; the CLI's call path, as the MCP result's `structuredContent`.
  const mcp = isRecord(result.data) && isRecord(result.data.result) ? result.data.result.structuredContent : undefined;
  const found = isRecord(result.output) ? result.output : isRecord(mcp) ? mcp : null;
  if (!found) return null;
  const { data_base64: b64, ...output } = found;
  if (typeof b64 !== 'string' || typeof output.mime_type !== 'string') return null;
  if (path?.toLowerCase().endsWith('.json')) return null;
  const name = typeof output.file_name === 'string' ? basename(output.file_name) : 'file';
  const target = path ?? join(tmpdir(), 'kortix-files', `${Date.now()}-${name}`);
  const bytes = Buffer.from(b64, 'base64');
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes);
  // `data` is the raw tool result, which repeats the base64.
  const { data: _raw, ...envelope } = result;
  return { ...envelope, output: { ...output, saved_to: target, bytes: bytes.length } };
}
