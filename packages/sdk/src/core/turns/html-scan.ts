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

/**
 * Decode HTML entities once: the named five plus `&nbsp;`, and numeric ones.
 * A copy of `decodeHtmlEntitiesOnce` in `@kortix/shared` (the SDK does not
 * depend on it). Looks at most 16 characters past each `&`, so the scan is linear.
 */
export function decodeHtmlEntitiesOnce(s: string): string {
  let decoded = '';
  let index = 0;
  while (index < s.length) {
    if (s[index] !== '&') {
      decoded += s[index];
      index += 1;
      continue;
    }
    const offset = s.slice(index + 1, index + 17).indexOf(';');
    const replacement = offset === -1 ? undefined : decodeEntity(s.slice(index + 1, index + 1 + offset));
    if (replacement === undefined) {
      decoded += s[index];
      index += 1;
      continue;
    }
    decoded += replacement;
    index += offset + 2;
  }
  return decoded;
}

function decodeEntity(entity: string): string | undefined {
  const lower = entity.toLowerCase();
  if (lower === 'nbsp') return ' ';
  if (lower === 'amp') return '&';
  if (lower === 'lt') return '<';
  if (lower === 'gt') return '>';
  if (lower === 'quot') return '"';
  if (lower === 'apos') return "'";
  if (!lower.startsWith('#')) return undefined;
  const numeric = lower[1] === 'x' ? Number.parseInt(lower.slice(2), 16) : Number.parseInt(lower.slice(1), 10);
  if (!Number.isFinite(numeric) || numeric < 0) return undefined;
  try {
    return String.fromCodePoint(numeric);
  } catch {
    return undefined;
  }
}

/**
 * The page title as a reader sees it: the first `<title>` element outside a
 * comment, inner tags stripped, entities decoded once, whitespace collapsed.
 * A copy of `extractReadableHtml(html).title` in `@kortix/shared` (the SDK does
 * not depend on it), so the SDK's sources list names pages as web always did.
 */
export function readableHtmlTitle(html: string): string | undefined {
  let index = 0;

  while (index < html.length) {
    const tagStart = html.indexOf('<', index);
    if (tagStart === -1) return undefined;

    const tagEnd = findTagCloseIndex(html, tagStart);
    if (tagEnd === -1) return undefined;

    const tag = readTag(html.slice(tagStart + 1, tagEnd));
    if (!tag.closing && tag.name === 'title') {
      const closing = findClosingTagRange(html, tagEnd + 1, 'title');
      const rawTitle = html.slice(tagEnd + 1, closing?.start ?? html.length);
      return normalizeInlineText(decodeHtmlEntitiesOnce(stripTagLikeSegments(rawTitle)));
    }

    index = tagEnd + 1;
  }

  return undefined;
}

function stripTagLikeSegments(input: string): string {
  let text = '';
  let index = 0;

  while (index < input.length) {
    if (input.startsWith('<!--', index)) {
      const commentEnd = input.indexOf('-->', index + 4);
      index = commentEnd === -1 ? input.length : commentEnd + 3;
      continue;
    }

    if (input[index] !== '<') {
      text += input[index];
      index += 1;
      continue;
    }

    const tagEnd = findTagCloseIndex(input, index);
    if (tagEnd === -1) break;
    index = tagEnd + 1;
  }

  return text;
}

function findClosingTagRange(
  html: string,
  fromIndex: number,
  tagName: string,
): { start: number; end: number } | undefined {
  let index = fromIndex;

  while (index < html.length) {
    const tagStart = html.indexOf('<', index);
    if (tagStart === -1) return undefined;

    const tagEnd = findTagCloseIndex(html, tagStart);
    if (tagEnd === -1) return undefined;

    const tag = readTag(html.slice(tagStart + 1, tagEnd));
    if (tag.closing && tag.name === tagName) {
      return { start: tagStart, end: tagEnd + 1 };
    }

    index = tagEnd + 1;
  }

  return undefined;
}

function findTagCloseIndex(input: string, tagStart: number): number {
  let quote: '"' | "'" | undefined;

  for (let index = tagStart + 1; index < input.length; index += 1) {
    const char = input[index];
    if (quote) {
      if (char === quote) quote = undefined;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (char === '>') return index;
  }

  return -1;
}

function readTag(rawTag: string): HtmlTag {
  let index = 0;

  while (index < rawTag.length && isWhitespace(rawTag[index])) {
    index += 1;
  }

  const closing = rawTag[index] === '/';
  if (closing) index += 1;

  while (index < rawTag.length && isWhitespace(rawTag[index])) {
    index += 1;
  }

  const nameStart = index;
  while (index < rawTag.length && isNameChar(rawTag[index])) {
    index += 1;
  }

  return {
    name: rawTag.slice(nameStart, index).toLowerCase(),
    closing,
  };
}

function normalizeInlineText(text: string): string {
  let normalized = '';
  let pendingSpace = false;

  for (const char of text) {
    if (isWhitespace(char)) {
      pendingSpace = normalized.length > 0;
      continue;
    }

    if (pendingSpace) {
      normalized += ' ';
      pendingSpace = false;
    }

    normalized += char;
  }

  return normalized.trim();
}

function isWhitespace(char: string): boolean {
  return (
    char === ' ' ||
    char === '\t' ||
    char === '\n' ||
    char === '\r' ||
    char === '\f' ||
    char === '\v'
  );
}

function isNameChar(char: string): boolean {
  const code = char.charCodeAt(0);
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    char === ':' ||
    char === '-' ||
    char === '_'
  );
}

interface HtmlTag {
  name: string;
  closing: boolean;
}
