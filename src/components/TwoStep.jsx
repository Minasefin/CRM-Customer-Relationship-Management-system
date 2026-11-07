// Two-step sign-in (2FA) in Settings. Nic's functions do the work (auth/README.md):
// beginTotpSetup → confirmTotpSetup → recovery codes; disableTotp to turn it off.
// The QR code is drawn here from the otpauth link (no online QR service), and the
// setup key and recovery codes live only in this pop-up's memory until it closes.
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import qrcode from 'qrcode-generator';
import PasswordField from './PasswordField.jsx';

const api = () => window.crm.api;
const reason = (e) => (e && (e.userMessage || e.message)) || 'That did not work. Try again.';
// Six digits from the app, or a 32-character recovery code (spaces and case don't matter).
export const cleanCode = (v) => String(v || '').replace(/[\s-]/g, '').toLowerCase();
const group = (s, n = 4) => s.match(new RegExp(`.{1,${n}}`, 'g'))?.join(' ') || s;

function Qr({ text, size = 184 }) {
  const { n, d } = useMemo(() => {
    const q = qrcode(0, 'M');
    q.addData(text);
    q.make();
    const count = q.getModuleCount();
    let path = '';
    for (let r = 0; r < count; r++) for (let c = 0; c < count; c++) if (q.isDark(r, c)) path += `M${c + 4} ${r + 4}h1v1h-1z`;
    return { n: count + 8, d: path };
  }, [text]);
  return (
    <svg className="qr" viewBox={`0 0 ${n} ${n}`} width={size} height={size} shapeRendering="crispEdges" role="img" aria-label="QR code for your authenticator app">
      <rect width={n} height={n} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  );
}

function Pop({ title, children, onClose, locked, label }) {
  const box = useRef(null);
  useEffect(() => {
    (box.current?.querySelector('[autofocus], input, .btn-primary') || box.current)?.focus();
  }, [title]);
  const close = () => !locked && onClose();
  return createPortal(
    <div className="dialog-root" onKeyDown={(e) => e.key === 'Escape' && close()}>
      <div className="drawer-scrim" onClick={close} />
      <div ref={box} tabIndex={-1} className="dialog dialog-wide two-step" role="dialog" aria-modal="true" aria-label={label || title}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}

function CodeField({ value, onChange, recovery, id = 'twostep-code', autoFocus }) {
  return (
    <label className="field" htmlFor={id}>
      <span>{recovery ? 'Recovery code' : '6-digit code from the app'}</span>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode={recovery ? 'text' : 'numeric'}
        autoComplete="one-time-code"
        maxLength={recovery ? 48 : 7}
        placeholder={recovery ? '32 letters and numbers' : '123456'}
        spellCheck={false}
        autoFocus={autoFocus}
        className="code-input"
      />
    </label>
  );
}

// Turn on: 1) password  2) scan + code  3) recovery codes (shown once).
function TurnOn({ onDone, onClose }) {
  const [step, setStep] = useState('password');
  const [pw, setPw] = useState('');
  const [setup, setSetup] = useState(null); // { secret, otpauthUri }
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const start = async (e) => {
    e.preventDefault();
    if (!pw) return setError('Enter your password.');
    setBusy(true);
    setError('');
    try {
      const r = await api().beginTotpSetup(pw);
      if (!r || !r.ok) throw new Error((r && r.error) || 'That did not work. Try again.');
      setSetup({ secret: r.secret, otpauthUri: r.otpauthUri });
      setPw('');
      setStep('scan');
    } catch (err) {
      setError(reason(err));
      setPw('');
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (e) => {
    e.preventDefault();
    const c = cleanCode(code);
    if (!/^\d{6}$/.test(c)) return setError('Enter the 6-digit code shown in the app.');
    setBusy(true);
    setError('');
    try {
      const r = await api().confirmTotpSetup(c);
      if (!r || !r.ok) throw new Error((r && r.error) || 'That code didn\'t work. Try the newest one.');
      setSetup(null); // forget the key
      setCodes(r.recoveryCodes);
      setStep('codes');
    } catch (err) {
      setError(/expired|start again/i.test(reason(err)) ? 'Setup took longer than 5 minutes. Close this and start again.' : reason(err));
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      setCopied(true);
    } catch {
      setError("Couldn't copy. Write them down instead.");
    }
  };

  if (step === 'password')
    return (
      <Pop title="Turn on two-step sign-in" onClose={onClose}>
        <form onSubmit={start} noValidate>
          <p className="muted">After this, signing in needs your password <strong>and</strong> a 6-digit code from an authenticator app on your phone (for example Microsoft Authenticator or Google Authenticator).</p>
          <PasswordField id="twostep-password" label="Your Auria password" value={pw} onChange={(v) => { setPw(v); setError(''); }} autoComplete="current-password" autoFocus />
          {error && <p className="save-error" role="alert">{error}</p>}
          <div className="btn-row">
            <button className="btn-primary" disabled={busy}>{busy ? 'Checking…' : 'Continue'}</button>
            <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          </div>
        </form>
      </Pop>
    );

  if (step === 'scan')
    return (
      <Pop title="Scan this with your phone" onClose={onClose}>
        <form onSubmit={confirm} noValidate>
          <div className="two-step-scan">
            <Qr text={setup.otpauthUri} />
            <div>
              <ol className="two-step-steps">
                <li>Open your authenticator app and add an account (the <strong>+</strong> button).</li>
                <li>Scan the code. It shows up as <strong>Auria</strong>.</li>
                <li>Type the 6-digit code the app shows.</li>
              </ol>
              <details className="two-step-key">
                <summary>Can't scan? Enter a key instead</summary>
                <code>{group(setup.secret)}</code>
                <p className="muted small">Choose "time-based" if the app asks.</p>
              </details>
            </div>
          </div>
          <CodeField value={code} onChange={(v) => { setCode(v); setError(''); }} autoFocus />
          {error && <p className="save-error" role="alert">{error}</p>}
          <div className="btn-row">
            <button className="btn-primary" disabled={busy}>{busy ? 'Checking…' : 'Turn on'}</button>
            <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          </div>
        </form>
      </Pop>
    );

  return (
    <Pop title="Save your recovery codes" onClose={onClose} locked label="Save your recovery codes">
      <p className="muted">If you lose your phone, each code signs you in <strong>once</strong> instead of the 6-digit code. Keep them somewhere safe outside Auria, like a password manager or on paper. <strong>You won't see them again.</strong></p>
      <ol className="recovery-codes">
        {codes.map((c) => <li key={c}><code>{group(c)}</code></li>)}
      </ol>
      <div className="recovery-actions">
        <button type="button" className="btn-ghost" onClick={copy}>{copied ? 'Copied' : 'Copy codes'}</button>
        <label className="check">
          <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} /> I saved my recovery codes
        </label>
      </div>
      {error && <p className="save-error" role="alert">{error}</p>}
      <div className="btn-row">
        <button className="btn-primary" disabled={!saved} onClick={() => { setCodes(null); onDone(); }}>Done</button>
      </div>
    </Pop>
  );
}

function TurnOff({ onDone, onClose }) {
  const [pw, setPw] = useState('');
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    if (!pw) return setError('Enter your password.');
    if (!cleanCode(code)) return setError(recovery ? 'Enter a recovery code.' : 'Enter the 6-digit code from the app.');
    setBusy(true);
    setError('');
    try {
      const r = await api().disableTotp(pw, cleanCode(code));
      if (!r || !r.ok) throw new Error((r && r.error) || 'That did not work. Try again.');
      onDone();
    } catch (err) {
      setError(reason(err));
      setCode('');
      setBusy(false);
    }
  };
  return (
    <Pop title="Turn off two-step sign-in?" onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <p className="muted">Signing in will only need your password. Your recovery codes stop working.</p>
        <PasswordField id="twostep-off-password" label="Your Auria password" value={pw} onChange={(v) => { setPw(v); setError(''); }} autoComplete="current-password" autoFocus />
        <CodeField id="twostep-off-code" value={code} onChange={(v) => { setCode(v); setError(''); }} recovery={recovery} />
        <button type="button" className="link-btn" onClick={() => { setRecovery(!recovery); setCode(''); }}>
          {recovery ? 'Use the app instead' : 'Use a recovery code instead'}
        </button>
        {error && <p className="save-error" role="alert">{error}</p>}
        <div className="btn-row">
          <button className="btn-primary" disabled={busy}>{busy ? 'Turning off…' : 'Turn off'}</button>
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
        </div>
      </form>
    </Pop>
  );
}

// The row in Settings → Security.
export default function TwoStep() {
  const [enabled, setEnabled] = useState(null);
  const [open, setOpen] = useState(null); // 'on' | 'off'
  const [note, setNote] = useState('');
  const refresh = () => api().getTotpStatus().then((s) => setEnabled(!!s.enabled)).catch(() => setEnabled(null));
  useEffect(() => {
    refresh();
  }, []);
  if (!api()?.getTotpStatus) return null;
  return (
    <div className="setting-row">
      <div>
        <span className="setting-label">
          Two-step sign-in{' '}
          {enabled != null && <span className={'pill ' + (enabled ? 'pill-on' : 'pill-off')}>{enabled ? 'On' : 'Off'}</span>}
        </span>
        <p className="muted small">
          {note || (enabled
            ? 'Signing in needs your password and a 6-digit code from your phone.'
            : 'Also ask for a 6-digit code from an authenticator app on your phone when signing in.')}
        </p>
      </div>
      {enabled != null && (
        <button className="btn-ghost" onClick={() => { setNote(''); setOpen(enabled ? 'off' : 'on'); }}>
          {enabled ? 'Turn off…' : 'Turn on…'}
        </button>
      )}
      {open === 'on' && <TurnOn onClose={() => setOpen(null)} onDone={() => { setOpen(null); setNote('Two-step sign-in is on. Next time, have your phone ready.'); refresh(); }} />}
      {open === 'off' && <TurnOff onClose={() => setOpen(null)} onDone={() => { setOpen(null); setNote('Two-step sign-in is off.'); refresh(); }} />}
    </div>
  );
}
