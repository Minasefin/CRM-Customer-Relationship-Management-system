import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// The ⋯ menu used on every card and row. Clicking it never opens the card underneath.
// items: [{ label, onSelect, danger? }]
//
// The menu is drawn on top of the whole page (not inside the card or table), so it is
// never cut off by a table's edge or a card's rounded corners. Near the bottom of the
// window it opens upward instead.
export default function MoreMenu({ items, label = 'More actions' }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const root = useRef(null);
  const menu = useRef(null);

  // Place the menu next to the button, flipping up if it would run off the bottom.
  const place = () => {
    const btn = root.current?.querySelector('.more-btn');
    const m = menu.current;
    if (!btn || !m) return;
    const r = btn.getBoundingClientRect();
    const h = m.offsetHeight;
    const w = m.offsetWidth;
    const up = r.bottom + 4 + h > window.innerHeight - 8 && r.top - 4 - h > 8;
    setPos({
      top: up ? r.top - 4 - h : r.bottom + 4,
      left: Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8)),
    });
  };
  useLayoutEffect(() => {
    if (open) place();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const inside = (t) => root.current?.contains(t) || menu.current?.contains(t);
    const close = (e) => !inside(e.target) && setOpen(false);
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    const follow = () => place(); // the page scrolled or resized: keep the menu by its button
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    window.addEventListener('resize', follow);
    document.addEventListener('scroll', follow, true);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
      window.removeEventListener('resize', follow);
      document.removeEventListener('scroll', follow, true);
    };
  }, [open]);

  useEffect(() => {
    if (open && pos) menu.current?.querySelector('[role=menuitem]')?.focus();
  }, [open, pos]);

  useEffect(() => {
    if (!open) setPos(null);
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
      {open &&
        createPortal(
          <div
            className="more-menu is-floating"
            role="menu"
            ref={menu}
            onClick={stop}
            onKeyDown={(e) => {
              stop(e);
              if (e.key === 'Escape') setOpen(false);
            }}
            style={pos ? { top: pos.top, left: pos.left } : { top: -9999, left: -9999 }}
          >
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
          </div>,
          document.body,
        )}
    </div>
  );
}
