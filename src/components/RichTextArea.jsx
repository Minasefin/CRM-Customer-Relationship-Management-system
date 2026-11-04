import { forwardRef, useImperativeHandle, useRef } from 'react';

// A notes box with Bold, Italic and List buttons (and Cmd/Ctrl+B, Cmd/Ctrl+I).
// Drop-in for <textarea>: same props, and onChange gets { target: { value } }.
// The text is saved with simple marks (**bold**, *italic*, "- " bullets); see lib/richText.jsx.
const RichTextArea = forwardRef(function RichTextArea({ value, onChange, onKeyDown, id, ...rest }, outer) {
  const box = useRef(null);
  useImperativeHandle(outer, () => box.current);

  const emit = (next, selStart, selEnd = selStart) => {
    onChange({ target: { value: next } });
    requestAnimationFrame(() => {
      const el = box.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(selStart, selEnd);
    });
  };

  // Wrap the selection in a mark, or remove the mark if it's already there.
  const wrap = (mark) => {
    const el = box.current;
    const { selectionStart: a, selectionEnd: b } = el;
    const v = value || '';
    const before = v.slice(0, a);
    const sel = v.slice(a, b);
    const after = v.slice(b);
    const n = mark.length;
    if (before.endsWith(mark) && after.startsWith(mark) && !(mark === '*' && before.endsWith('**') && after.startsWith('**'))) {
      return emit(before.slice(0, -n) + sel + after.slice(n), a - n, b - n);
    }
    if (sel.startsWith(mark) && sel.endsWith(mark) && sel.length >= 2 * n) {
      const inner = sel.slice(n, -n);
      return emit(before + inner + after, a, a + inner.length);
    }
    emit(before + mark + sel + mark + after, a + n, b + n);
  };

  // Turn the selected lines into a bulleted list, or back into plain lines.
  const list = () => {
    const el = box.current;
    const v = value || '';
    const start = v.lastIndexOf('\n', el.selectionStart - 1) + 1;
    let end = v.indexOf('\n', el.selectionEnd);
    if (end === -1) end = v.length;
    const lines = v.slice(start, end).split('\n');
    const allBullets = lines.every((l) => /^- /.test(l));
    const next = lines.map((l) => (allBullets ? l.replace(/^- /, '') : /^- /.test(l) ? l : `- ${l}`)).join('\n');
    emit(v.slice(0, start) + next + v.slice(end), start + next.length); // cursor at the end, ready to type
  };

  const keyDown = (e) => {
    const mod = (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey;
    if (mod && (e.key === 'b' || e.key === 'B')) {
      e.preventDefault();
      e.stopPropagation(); // don't fold the sidebar while typing
      return wrap('**');
    }
    if (mod && (e.key === 'i' || e.key === 'I')) {
      e.preventDefault();
      e.stopPropagation();
      return wrap('*');
    }
    // Enter inside a bullet list starts the next bullet; Enter on an empty bullet ends the list.
    if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const el = e.currentTarget;
      const v = value || '';
      const pos = el.selectionStart;
      if (pos === el.selectionEnd) {
        const lineStart = v.lastIndexOf('\n', pos - 1) + 1;
        const line = v.slice(lineStart, pos);
        if (/^- \S/.test(line)) {
          e.preventDefault();
          return emit(v.slice(0, pos) + '\n- ' + v.slice(pos), pos + 3);
        }
        if (line === '- ') {
          e.preventDefault();
          return emit(v.slice(0, lineStart) + v.slice(pos), lineStart);
        }
      }
    }
    onKeyDown?.(e);
  };

  const tool = (label, title, action, className) => (
    <button
      type="button"
      className={'rich-tool ' + (className || '')}
      title={title}
      aria-label={title}
      onMouseDown={(e) => e.preventDefault()} // keep the selection in the box
      onClick={action}
    >
      {label}
    </button>
  );

  return (
    <div className="rich-area">
      <div className="rich-toolbar" role="toolbar" aria-label="Formatting">
        {tool(<b>B</b>, 'Bold (Cmd/Ctrl+B)', () => wrap('**'))}
        {tool(<i>I</i>, 'Italic (Cmd/Ctrl+I)', () => wrap('*'))}
        {tool(
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 6h11M9 12h11M9 18h11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <circle cx="4.5" cy="6" r="1.4" fill="currentColor" />
            <circle cx="4.5" cy="12" r="1.4" fill="currentColor" />
            <circle cx="4.5" cy="18" r="1.4" fill="currentColor" />
          </svg>,
          'Bulleted list',
          list,
        )}
      </div>
      <textarea ref={box} id={id} value={value} onChange={onChange} onKeyDown={keyDown} {...rest} />
    </div>
  );
});

export default RichTextArea;
