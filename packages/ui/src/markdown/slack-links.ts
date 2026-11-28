import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { defaultRemarkPlugins } from 'streamdown';

// Parse without GFM autolinks: GFM mistakes the URL plus `|label` for a link.
// CommonMark and the renderer's math plugin protect literal contexts for us.
const mathPlugin = defaultRemarkPlugins.math;
const parser = unified().use(remarkParse).use([
  Array.isArray(mathPlugin)
    ? [mathPlugin[0], { ...mathPlugin[1], singleDollarTextMath: true }]
    : mathPlugin,
]);
interface Node {
  type: string;
  position?: { start: { offset?: number }; end: { offset?: number } };
  children?: Node[];
}

/** Convert complete Slack HTTP(S) links only; labels are literal, not markdown. */
export function normalizeSlackLinks(source: string): string {
  if (!source.includes('|') || !source.includes('<')) return source;
  const protectedRanges: Array<[number, number]> = [];
  const visit = (node: Node) => {
    if (['code', 'inlineCode', 'math', 'inlineMath', 'link', 'linkReference', 'image', 'imageReference', 'definition', 'html'].includes(node.type)) {
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      if (start !== undefined && end !== undefined) {
        // CommonMark accepts a space-free Slack link as an angle autolink.
        // Its source starts with `<`, unlike an explicit Markdown link.
        const raw = source.slice(start, end);
        if (node.type === 'link' && /^<https?:\/\/[^<>\s]*\|[^<>\s]+>$/i.test(raw)) return;
        protectedRanges.push([start, end]);
      }
      return;
    }
    node.children?.forEach(visit);
  };
  visit(parser.parse(source));
  let rangeIndex = 0;
  // Each candidate consumes its entire angle span, with no nested start scan.
  return source.replace(/<([^<>\n]*)>/g, (whole: string, body: string, offset: number) => {
    while (rangeIndex < protectedRanges.length && protectedRanges[rangeIndex][1] <= offset) rangeIndex++;
    const range = protectedRanges[rangeIndex];
    if (range && offset < range[1] && offset + whole.length > range[0]) return whole;
    const separator = body.indexOf('|');
    if (separator < 0) return whole;
    const href = body.slice(0, separator);
    const label = body.slice(separator + 1);
    if (!/^https?:\/\/[^\s\\]+$/i.test(href) || !label) return whole;
    try { new URL(href); } catch { return whole; }
    const escapedLabel = label.replace(/&/g, '&amp;').replace(/[\\`*{}\[\]()#+.!_<>~|$]/g, '\\$&');
    const destination = href.replace(/&/g, '&amp;').replace(/[()]/g, (char) => char === '(' ? '%28' : '%29');
    return `[${escapedLabel}](${destination})`;
  });
}
