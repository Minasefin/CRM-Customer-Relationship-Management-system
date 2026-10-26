import { useEffect, useRef, useState } from 'react';

// The ⋯ menu used on every card and row. Clicking it never opens the card underneath.
// items: [{ label, onSelect, danger? }]
export default function MoreMenu({ items, label = 'More actions' }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => !root.current?.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    root.current?.querySelector('[role=menuitem]')?.focus();
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const stop = (e) => e.stopPropagation();

  return (
    <div className="more" ref={root} onClick={stop} onKeyDown={stop}>
      <button
        type="button"
        className="more-btn"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="5" cy="12" r="1.8" fill="currentColor" />
          <circle cx="12" cy="12" r="1.8" fill="currentColor" />
          <circle cx="19" cy="12" r="1.8" fill="currentColor" />
        </svg>
      </button>
      {open && (
        <div className="more-menu" role="menu">
          {items.map((it) => (
            <button
              key={it.label}
              role="menuitem"
              className={'more-item' + (it.danger ? ' is-danger' : '')}
              onClick={() => {
                setOpen(false);
                it.onSelect();
              }}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
