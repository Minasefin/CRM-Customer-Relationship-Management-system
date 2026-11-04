// Notes are stored as plain text with a few Markdown marks:
//   **bold**   *italic*   - bullet   1. numbered
// The text in the database stays readable on its own. It is shown by turning those
// marks into React elements; no HTML from a note is ever inserted into the page.

const INLINE = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|_[^_\n]+_)/g;

function inline(text, key) {
  return text.split(INLINE).map((part, i) => {
    if (!part) return null;
    const k = `${key}-${i}`;
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <strong key={k}>{part.slice(2, -2)}</strong>;
    if ((part.startsWith('*') && part.endsWith('*')) || (part.startsWith('_') && part.endsWith('_'))) {
      if (part.length > 2) return <em key={k}>{part.slice(1, -1)}</em>;
    }
    return part;
  });
}

const BULLET = /^\s*[-*•]\s+/;
const NUMBER = /^\s*\d+[.)]\s+/;

// Text with marks -> elements. Plain notes (no marks) look exactly as before.
export function RichText({ text, className = '' }) {
  const lines = String(text || '').split('\n');
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const kind = BULLET.test(line) ? 'ul' : NUMBER.test(line) ? 'ol' : null;
    if (kind) {
      const items = [];
      const re = kind === 'ul' ? BULLET : NUMBER;
      while (i < lines.length && re.test(lines[i])) items.push(lines[i++].replace(re, ''));
      const List = kind;
      blocks.push(
        <List key={blocks.length}>
          {items.map((it, j) => <li key={j}>{inline(it, `${blocks.length}-${j}`)}</li>)}
        </List>,
      );
      continue;
    }
    const para = [];
    while (i < lines.length && !BULLET.test(lines[i]) && !NUMBER.test(lines[i])) para.push(lines[i++]);
    const trimmed = para.join('\n').replace(/^\n+|\n+$/g, '');
    if (trimmed) {
      blocks.push(
        <p key={blocks.length}>
          {trimmed.split('\n').map((l, j, all) => (
            <span key={j}>
              {inline(l, `${blocks.length}-${j}`)}
              {j < all.length - 1 && <br />}
            </span>
          ))}
        </p>,
      );
    }
  }
  return <div className={'rich ' + className}>{blocks}</div>;
}

// Marks removed, for one-line previews.
export const plainText = (text) =>
  String(text || '')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/_([^_\n]+)_/g, '$1')
    .replace(/^\s*([-*•]|\d+[.)])\s+/gm, '');
