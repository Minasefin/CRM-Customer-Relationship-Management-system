// Recovery key: the one way to reset a forgotten password (Nic's auth, auth/recovery.cjs).
// Made in Settings with the current password; shown once; used on the sign-in screen.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import PasswordField from './PasswordField.jsx';

const api = () => window.crm.api;
const reason = (e) => (e && (e.userMessage || e.message)) || 'That did not work. Try again.';

// Shows a recovery key once, with Copy and "I saved it" before Done.
export function ShowRecoveryKey({ recoveryKey, intro, onDone, doneLabel = 'Done' }) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(recoveryKey);
      setCopied(true);
    } catch {
      setError("Couldn't copy. Write it down instead.");
    }
  };
  return (
    <div className="recovery-show">
      <p className="muted">{intro}</p>
      <code className="recovery-key" aria-label="Your recovery key">{recoveryKey}</code>
      <p className="muted small">Keep it somewhere safe outside Auria, like a password manager or on paper. <strong>You won't see it again.</strong> Anyone with this key (and your 2FA code, if it's on) can reset your password.</p>
      <div className="recovery-actions">
        <button type="button" className="btn-ghost" onClick={copy}>{copied ? 'Copied' : 'Copy key'}</button>
        <label className="check">
          <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} /> I saved my recovery key
        </label>
      </div>
      {error && <p className="save-error" role="alert">{error}</p>}
      <div className="btn-row">
        <button type="button" className="btn-primary" disabled={!saved} onClick={onDone}>{doneLabel}</button>
      </div>
    </div>
  );
}

function Pop({ title, children, onClose, locked }) {
  const box = useRef(null);
  useEffect(() => {
    (box.current?.querySelector('input, .btn-primary') || box.current)?.focus();
  }, [title]);
  const close = () => !locked && onClose();
  return createPortal(
    <div className="dialog-root" onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') close(); }}>
      <div className="drawer-scrim" onClick={close} />
      <div ref={box} tabIndex={-1} className="dialog dialog-wide two-step" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}

function MakeKey({ replacing, onDone, onClose }) {
  const [pw, setPw] = useState('');
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    if (!pw) return setError('Enter your password.');
    setBusy(true);
    setError('');
    try {
      const r = await api().createRecoveryKey(pw);
      if (!r || !r.ok) throw new Error((r && r.error) || 'That did not work. Try again.');
      setKey(r.recoveryKey);
    } catch (err) {
      setError(reason(err));
      setPw('');
    } finally {
      setBusy(false);
    }
  };
  if (key)
    return (
      <Pop title="Your recovery key" onClose={onClose} locked>
        <ShowRecoveryKey recoveryKey={key} intro="If you ever forget your password, this key lets you choose a new one." onDone={() => { setKey(''); onDone(); }} />
      </Pop>
    );
  return (
    <Pop title={replacing ? 'Make a new recovery key?' : 'Make a recovery key'} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <p className="muted">
          {replacing
            ? 'Your old recovery key will stop working.'
            : "Without one, a forgotten password can't be reset by anyone. The key is shown once."}
        </p>
        <PasswordField id="recovery-password" label="Your Auria password" value={pw} onChange={(v) => { setPw(v); setError(''); }} autoComplete="current-password" autoFocus />
        {error && <p className="save-error" role="alert">{error}</p>}
        <div className="btn-row">
          <button className="btn-primary" disabled={busy}>{busy ? 'Making…' : 'Make key'}</button>
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
        </div>
      </form>
    </Pop>
  );
}

// The row in Settings → Security.
export default function RecoveryKeySetting() {
  const [enabled, setEnabled] = useState(null);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const refresh = () => api().getRecoveryStatus().then((s) => setEnabled(!!s.enabled)).catch(() => setEnabled(null));
  useEffect(() => {
    refresh();
  }, []);
  if (!api()?.getRecoveryStatus) return null;
  return (
    <div className="setting-row">
      <div>
        <span className="setting-label">
          Recovery key{' '}
          {enabled != null && <span className={'pill ' + (enabled ? 'pill-on' : 'pill-warn')}>{enabled ? 'Made' : 'Not made'}</span>}
        </span>
        <p className="muted small">
          {note || (enabled
            ? 'If you forget your password, use your recovery key on the sign-in screen to choose a new one.'
            : "Recommended. It's the only way to reset a forgotten password.")}
        </p>
      </div>
      {enabled != null && (
        <button className="btn-ghost" onClick={() => { setNote(''); setOpen(true); }}>
          {enabled ? 'Make a new one…' : 'Make a recovery key…'}
        </button>
      )}
      {open && (
        <MakeKey
          replacing={enabled}
          onClose={() => setOpen(false)}
          onDone={() => { setOpen(false); setNote('Recovery key saved. Keep it somewhere safe.'); refresh(); }}
        />
      )}
    </div>
  );
}
