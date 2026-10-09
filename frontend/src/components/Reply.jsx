// Safe formatter for Heartly's replies. Models write light Markdown, so this handles: paragraphs, "-", "*" and "•" bullets,
// numbered lists, # headings, **bold**, *italic* and `code`. Everything is built as React elements; no HTML is ever injected.
const BULLET = /^\s*([-*•])\s+/;
const NUMBER = /^\s*\d+[.)]\s+/;
const HEADING = /^\s{0,3}#{1,4}\s+/;

function inline(text) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g).map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**') && p.length > 4) return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (p.startsWith('`') && p.endsWith('`') && p.length > 2) return <code key={i}>{p.slice(1, -1)}</code>;
    if (p.startsWith('*') && p.endsWith('*') && p.length > 2) return <em key={i}>{p.slice(1, -1)}</em>;
    return p;
  });
}

export default function Reply({ text }) {
  const out = [];
  let list = null;                       // {ordered, items} while inside a list
  let para = [];                         // consecutive plain lines
  const flushPara = () => { if (para.length) { out.push(<p key={out.length}>{para.map((l, j) => <span key={j}>{inline(l)}{j < para.length - 1 && <br />}</span>)}</p>); para = []; } };
  const flushList = () => {
    if (!list) return;
    const Tag = list.ordered ? 'ol' : 'ul';
    out.push(<Tag key={out.length}>{list.items.map((t, j) => <li key={j}>{inline(t)}</li>)}</Tag>);
    list = null;
  };
  text.split('\n').forEach((raw) => {
    const line = raw.trimEnd();
    if (!line.trim()) { flushPara(); flushList(); return; }
    if (HEADING.test(line)) { flushPara(); flushList(); out.push(<p key={out.length} className="r-head"><strong>{inline(line.replace(HEADING, ''))}</strong></p>); return; }
    const bullet = BULLET.test(line); const numbered = !bullet && NUMBER.test(line);
    if (bullet || numbered) {
      flushPara();
      const ordered = numbered;
      if (list && list.ordered !== ordered) flushList();
      if (!list) list = { ordered, items: [] };
      list.items.push(line.replace(ordered ? NUMBER : BULLET, ''));
      return;
    }
    flushList(); para.push(line.trim());
  });
  flushPara(); flushList();
  return out;
}
