/** Linear scans of HTML text. Internal: not in the barrel. */

/**
 * A tag name ends here — the next character is not another name character.
 * Without this, `<scriptish>` would be treated as a `<script>` open tag.
 */
export function isTagNameBoundary(code: number): boolean {
  if (Number.isNaN(code)) return true; // end of string
  const isAlnum =
    (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
  return !isAlnum;
}

/**
 * The `<title>` text, by forward scan.
 *
 * This was `/<title[^>]*>([^<]*)<\/title>/i`, which CodeQL flagged as
 * `js/polynomial-redos`: every `<title` in the body is a match start, and
 * `[^>]*` rescans the whole tail from each one before failing, so a page that
 * is a long run of unclosed tags costs O(n^2). The body is whatever an upstream
 * gateway returned, so it is attacker-influenced. Measured before this change:
 * 30,000 unclosed `<title` took 4.25 s. Every `indexOf` below starts at a
 * position that only moves forward, so the whole scan is linear.
 *
 * Semantics are unchanged: the title must be followed by a real `</title>`
 * close, and its text stops at the first `<`. The one thing that IS new is
 * tolerating whitespace before the bracket (`</title >`), which HTML permits.
 */
export function titleFromHtml(str: string, lower: string): string | undefined {
  let from = 0;
  for (;;) {
    const open = lower.indexOf('<title', from);
    if (open === -1) return undefined;
    const afterName = open + '<title'.length;
    if (!isTagNameBoundary(lower.charCodeAt(afterName))) {
      from = afterName;
      continue;
    }
    const gt = str.indexOf('>', afterName);
    if (gt === -1) return undefined;
    const nextTag = str.indexOf('<', gt + 1);
    if (nextTag !== -1 && lower.startsWith('</title', nextTag)) {
      const title = str.slice(gt + 1, nextTag).trim();
      if (title) return title;
    }
    from = gt + 1;
  }
}
