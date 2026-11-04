import { useEffect, useRef } from 'react';
import Icon from './Icon.jsx';

// Panel that slides in from the right. onRequestClose lets the form decide
// whether to warn about unsaved changes before actually closing.
// onSubmit: Enter in a one-line field (or Cmd/Ctrl+Enter anywhere) saves the form.
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

  const onKeyDown = (e) => {
    if (e.key !== 'Enter' || !onSubmit || e.defaultPrevented || e.isComposing) return;
    const t = e.target;
    const oneLine = t.tagName === 'INPUT' && !['button', 'checkbox', 'radio', 'file', 'submit'].includes(t.type);
    if (oneLine || ((e.metaKey || e.ctrlKey) && t.tagName === 'TEXTAREA')) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <div className="drawer-root" onKeyDown={onKeyDown}>
      <div className="drawer-scrim" onClick={onRequestClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={title} ref={panel}>
        <header className="drawer-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onRequestClose} aria-label="Close">
            <Icon name="close" size={18} />
          </button>
        </header>
        <div className="drawer-body">{children}</div>
        {footer && <footer className="drawer-foot">{footer}</footer>}
      </aside>
    </div>
  );
}
