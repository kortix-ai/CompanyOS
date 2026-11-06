/** Non-secret origin selector. Authority always comes from the preview ticket. */
export async function partitionPreviewUrl(value: string, subject: string): Promise<string> {
  if (!subject) throw new Error('Preview identity unavailable');
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`kortix-preview-identity:v1:${subject}`)));
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  let bits = 0, accumulator = 0, partition = '';
  for (const byte of bytes.slice(0, 12)) {
    accumulator = (accumulator << 8) | byte; bits += 8;
    while (bits >= 5) { bits -= 5; partition += alphabet[(accumulator >>> bits) & 31]; }
  }
  if (bits) partition += alphabet[(accumulator << (5 - bits)) & 31];
  const url = new URL(value);
  const labels = url.hostname.split('.');
  const alreadyPartitioned = /--i[a-z2-7]{20}$/.test(labels[0]!);
  let label = labels[0]!.replace(/^(dev|staging|prod|preview)-/, (_, env: string) => ({dev:'d',staging:'s',prod:'p',preview:'r'})[env]! + '-' ).replace(/--i[a-z2-7]{20}$/, '');
  label = label.replace(/^((?:(?:d|s|p|r)-)?p\d{1,5}-)(.+)$/, (_, prefix: string, sandbox: string) => {
    if (/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(sandbox)) {
      return prefix + 'uuid-' + BigInt('0x' + sandbox.replaceAll('-', '')).toString(36).padStart(25, '0');
    }
    if (!alreadyPartitioned && sandbox.startsWith('uuid-')) throw new Error('Reserved preview sandbox encoding');
    return prefix + sandbox;
  });
  if (label.includes('--i')) throw new Error('Invalid preview partition');
  labels[0] = `${label}--i${partition}`;
  if (labels[0].length > 63) throw new Error('Preview hostname exceeds DNS label limit');
  url.hostname = labels.join('.');
  return url.toString();
}
