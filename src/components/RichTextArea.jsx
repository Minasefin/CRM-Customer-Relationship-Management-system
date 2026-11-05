import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';

// A notes box that shows formatting as you type: Bold, Italic and bullet lists, from the
// buttons or Cmd/Ctrl+B and Cmd/Ctrl+I. What you see is what gets saved.
//
// Drop-in for <textarea>: same props (value, onChange, placeholder, rows, aria-label,
// autoFocus, onKeyDown), and onChange gets { target: { value } }.
// The value is still plain text with simple marks (**bold**, *italic*, "- " bullets),
// so the database and the note display (lib/richText.jsx) don't change.
//
// Safety: the box is filled by building elements from that text (never from HTML), and
// pasting always inserts plain text, so no outside formatting or markup gets in.

const INLINE = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|_[^_\n]+_)/g;
const BULLET = /^\s*[-*•]\s+/;

// Marks -> elements, for filling the box.
function fill(root, text) {
  root.replaceChildren();
  const inline = (parent, line) => {
    for (const part of line.split(INLINE)) {
      if (!part) continue;
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
        const b = document.createElement('b');
        b.textContent = part.slice(2, -2);
        parent.append(b);
      } else if ((part.startsWith('*') && part.endsWith('*')) || (part.startsWith('_') && part.endsWith('_'))) {
        const i = document.createElement('i');
        i.textContent = part.slice(1, -1);
        parent.append(i);
      } else parent.append(document.createTextNode(part));
    }
  };
  const lines = String(text || '').split('\n');
  for (let n = 0; n < lines.length; n++) {
    if (BULLET.test(lines[n])) {
      const ul = document.createElement('ul');
      while (n < lines.length && BULLET.test(lines[n])) {
        const li = document.createElement('li');
        inline(li, lines[n].replace(BULLET, ''));
        if (!li.firstChild) li.append(document.createElement('br'));
        ul.append(li);
        n++;
      }
      n--;
      root.append(ul);
    } else {
      const div = document.createElement('div');
      inline(div, lines[n]);
      if (!div.firstChild) div.append(document.createElement('br'));
      root.append(div);
    }
  }
}

// Elements -> marks, for saving.
function read(root) {
  const lines = [];
  let cur = '';
  const flush = () => {
    lines.push(cur);
    cur = '';
  };
  const inlineText = (node) => {
    let out = '';
    node.childNodes.forEach((c) => {
      if (c.nodeType === 3) out += c.nodeValue.replace(/ /g, ' ');
      else if (c.nodeName === 'BR') out += '\n';
      else {
        const inner = inlineText(c);
        const tag = c.nodeName;
        const style = c.getAttribute ? c.getAttribute('style') || '' : '';
        const bold = tag === 'B' || tag === 'STRONG' || /font-weight:\s*(bold|[6-9]00)/.test(style);
        const ital = tag === 'I' || tag === 'EM' || /font-style:\s*italic/.test(style);
        const m = inner.match(/^(\s*)(.*?)(\s*)$/s); // keep spaces outside the marks
        let core = m[2];
        if (core && !core.includes('\n')) {
          if (ital) core = `*${core}*`;
          if (bold) core = `**${core}**`;
        }
        out += m[1] + core + m[3];
      }
    });
    return out;
  };
  const walk = (node) => {
    node.childNodes.forEach((c) => {
      if (c.nodeName === 'UL' || c.nodeName === 'OL') {
        if (cur) flush();
        c.querySelectorAll(':scope > li').forEach((li) => lines.push('- ' + inlineText(li).replace(/\n+$/, '').replace(/\n/g, ' ')));
      } else if ((c.nodeName === 'DIV' || c.nodeName === 'P') && c.querySelector(':scope > ul, :scope > ol, :scope > div, :scope > p')) {
        if (cur) flush();
        walk(c); // a line that holds a list or more lines (the browser nests them like that)
      } else if (c.nodeName === 'DIV' || c.nodeName === 'P') {
        if (cur) flush();
        const t = inlineText(c).replace(/\n$/, '');
        t.split('\n').forEach((l) => lines.push(l));
      } else if (c.nodeName === 'BR') {
        flush();
      } else {
        cur += c.nodeType === 3 ? c.nodeValue.replace(/ /g, ' ') : inlineText(c);
      }
    });
  };
  walk(root);
  if (cur) flush();
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
  return lines.join('\n');
}

const RichTextArea = forwardRef(function RichTextArea(
  { value, onChange, onKeyDown, placeholder, rows = 3, autoFocus, id, className = '', ...rest },
  outer,
) {
  const box = useRef(null);
  const last = useRef(null); // the text this box last reported, to avoid redrawing while typing
  const [active, setActive] = useState({ bold: false, italic: false, list: false });
  useImperativeHandle(outer, () => box.current);

  // Fill from the value when it changes from outside (first show, or cleared after saving).
  useLayoutEffect(() => {
    const v = value || '';
    if (box.current && v !== last.current) {
      fill(box.current, v);
      last.current = v;
      setActive({ bold: false, italic: false, list: false });
    }
  }, [value]);

  useEffect(() => {
    if (!autoFocus || !box.current) return;
    box.current.focus();
    const sel = window.getSelection();
    sel.selectAllChildren(box.current);
    sel.collapseToEnd();
  }, [autoFocus]);

  // Keep the B / I / list buttons lit when the cursor is inside that formatting.
  useEffect(() => {
    const update = () => {
      if (!box.current || !box.current.contains(document.getSelection()?.anchorNode)) return;
      setActive({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        list: document.queryCommandState('insertUnorderedList'),
      });
    };
    document.addEventListener('selectionchange', update);
    return () => document.removeEventListener('selectionchange', update);
  }, []);

  const emit = () => {
    const v = read(box.current);
    last.current = v;
    onChange({ target: { value: v } });
  };

  const run = (cmd) => {
    box.current.focus();
    document.execCommand(cmd);
    emit();
    setActive((a) => ({ ...a, [cmd === 'insertUnorderedList' ? 'list' : cmd]: document.queryCommandState(cmd) }));
  };

  const keyDown = (e) => {
    const mod = (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey;
    if (mod && (e.key === 'b' || e.key === 'B')) {
      e.preventDefault();
      e.stopPropagation(); // don't fold the sidebar while typing
      return run('bold');
    }
    if (mod && (e.key === 'i' || e.key === 'I')) {
      e.preventDefault();
      e.stopPropagation();
      return run('italic');
    }
    if (mod && (e.key === 'u' || e.key === 'U')) e.preventDefault(); // underline isn't kept, so don't offer it
    onKeyDown?.(e);
  };

  // Paste as plain text only.
  const paste = (e) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
  };

  const tool = (label, title, cmd, on) => (
    <button
      type="button"
      className={'rich-tool' + (on ? ' is-on' : '')}
      title={title}
      aria-label={title}
      aria-pressed={on}
      onMouseDown={(e) => e.preventDefault()} // keep the cursor in the box
      onClick={() => run(cmd)}
    >
      {label}
    </button>
  );

  const empty = !(value || '').trim();
  return (
    <div className={'rich-area ' + className}>
      <div className="rich-toolbar" role="toolbar" aria-label="Formatting">
        {tool(<b>B</b>, 'Bold (Cmd/Ctrl+B)', 'bold', active.bold)}
        {tool(<i>I</i>, 'Italic (Cmd/Ctrl+I)', 'italic', active.italic)}
        {tool(
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 6h11M9 12h11M9 18h11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <circle cx="4.5" cy="6" r="1.4" fill="currentColor" />
            <circle cx="4.5" cy="12" r="1.4" fill="currentColor" />
            <circle cx="4.5" cy="18" r="1.4" fill="currentColor" />
          </svg>,
          'Bulleted list',
          'insertUnorderedList',
          active.list,
        )}
      </div>
      <div
        ref={box}
        id={id}
        className={'rich-editor' + (empty ? ' is-empty' : '')}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder}
        style={{ minHeight: `${Math.max(2, rows) * 1.5 + 1.4}em` }}
        onInput={emit}
        onKeyDown={keyDown}
        onPaste={paste}
        spellCheck
        {...rest}
      />
    </div>
  );
});

export default RichTextArea;
