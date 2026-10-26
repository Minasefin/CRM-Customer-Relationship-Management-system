import { useEffect, useRef, useState } from 'react';

// One confirm box for the whole app. Main action first, then Cancel.
// danger=true makes the main button red (for deletes).
export default function ConfirmDialog({ title, message, confirmLabel, danger, onConfirm, onCancel }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const main = useRef(null);

  useEffect(() => {
    main.current?.focus();
    const esc = (e) => e.key === 'Escape' && onCancel();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onCancel]);

  const go = async () => {
    setBusy(true);
    try {
      await onConfirm();
    } catch (err) {
      setError(err?.userMessage || err?.message || 'That did not work. Try again.');
      setBusy(false);
    }
  };

  return (
    <div className="dialog-root">
      <div className="drawer-scrim" onClick={onCancel} />
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dialog-title">
        <h2 id="dialog-title">{title}</h2>
        {message && <p className="muted">{message}</p>}
        {error && <p className="field-error">{error}</p>}
        <div className="btn-row">
          <button ref={main} className={danger ? 'btn-danger' : 'btn-primary'} onClick={go} disabled={busy}>
            {confirmLabel}
          </button>
          <button className="btn-ghost" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
