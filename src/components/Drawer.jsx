import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';

// Panel that slides in from the right. onRequestClose lets the form decide
// whether to warn about unsaved changes before actually closing.
// onSubmit, with Enter in two steps:
//   type in a field, press Enter    -> that field is confirmed (green check)
//   press Enter again, no new typing -> the form saves
// Cmd/Ctrl+Enter saves right away, including from a notes box.
export default function Drawer({ title, onRequestClose, children, footer, onSubmit }) {
  const panel = useRef(null);
  const close = useRef(onRequestClose);
  close.current = onRequestClose;

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && close.current();
    document.addEventListener('keydown', onKey);
    panel.current?.querySelector('input:not([type=file]), select, textarea')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const confirmed = useRef(null); // { el, value } of the field last confirmed with Enter
  const [hint, setHint] = useState(false);
  const unconfirm = () => {
    confirmed.current?.el.classList.remove('is-confirmed');
    confirmed.current = null;
    setHint(false);
  };

  const onKeyDown = (e) => {
    if (e.key !== 'Enter' || !onSubmit || e.defaultPrevented || e.isComposing) return;
    const t = e.target;
    const oneLine = t.tagName === 'INPUT' && !['button', 'checkbox', 'radio', 'file', 'submit'].includes(t.type);
    const shortcut = e.metaKey || e.ctrlKey;
    if (!oneLine && !(shortcut && t.tagName === 'TEXTAREA')) return;
    e.preventDefault();
    const c = confirmed.current;
    if (shortcut || (c && c.el === t && c.value === t.value)) {
      unconfirm();
      onSubmit();
      return;
    }
    unconfirm();
    confirmed.current = { el: t, value: t.value };
    t.classList.add('is-confirmed');
    setHint(true);
  };

  return (
    <div className="drawer-root" onKeyDown={onKeyDown} onInput={() => confirmed.current && unconfirm()}>
      <div className="drawer-scrim" onClick={onRequestClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={title} ref={panel}>
        <header className="drawer-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onRequestClose} aria-label="Close">
            <Icon name="close" size={18} />
          </button>
        </header>
        <div className="drawer-body">{children}</div>
        {hint && onSubmit && (
          <p className="enter-hint" role="status">
            <kbd>Enter</kbd> again to save
          </p>
        )}
        {footer && <footer className="drawer-foot">{footer}</footer>}
      </aside>
    </div>
  );
}
