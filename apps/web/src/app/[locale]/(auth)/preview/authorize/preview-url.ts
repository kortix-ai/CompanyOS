/**
 * True only for a URL on a hostname this deployment serves previews on.
 *
 * The template gives the exact origin shape; we compare the host SUFFIX and the
 * label form rather than string-matching the whole URL, because the port and
 * sandbox vary. Anything else — another domain, a lookalike, a path on our own
 * app — is refused.
 */
export function isServablePreviewUrl(candidate: string, template: string | null): boolean {
  if (!template) return false;
  let url: URL;
  let shape: URL;
  try {
    url = new URL(candidate);
    shape = new URL(template.replace('{port}', '1').replace('{sandbox}', 'x'));
  } catch {
    return false;
  }
  if (url.protocol !== shape.protocol) return false;

  if (url.port !== shape.port || url.username || url.password) return false;
  const marker = '65000-kortixpreviewplaceholder';
  const trusted = new URL(
    template.replace('{port}', '65000').replace('{sandbox}', 'kortixpreviewplaceholder'),
  );
  const parts = trusted.hostname.split(marker);
  if (parts.length !== 2) return false;
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const compact = (
    { 'dev-p': 'd-p', 'staging-p': 's-p', 'prod-p': 'p-p', 'preview-p': 'r-p' } as Record<
      string,
      string
    >
  )[parts[0]];
  const prefix = compact ? `(?:${escape(parts[0])}|${escape(compact)})` : escape(parts[0]);
  return new RegExp(`^${prefix}\\d{1,5}-[a-z0-9-]+${escape(parts[1])}$`).test(url.hostname);
}
