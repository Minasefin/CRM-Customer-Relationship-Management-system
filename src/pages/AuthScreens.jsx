// First-time setup and sign-in. Shown before the app when the real database is locked.
// Nic's functions do the work (auth/README.md). On success the app reloads itself
// with the unlocked data, so these screens never hold contact data.
import { useEffect, useState } from 'react';
import PasswordField, { passwordLength } from '../components/PasswordField.jsx';

const MIN = 15;
const MAX = 128;
const api = () => window.crm.api;
const reason = (e) => (e && (e.userMessage || e.message)) || 'That did not work. Try again.';

function AuthCard({ title, sub, children, footer }) {
  return (
    <main className="auth-screen">
      <div className="auth-card">
        <div className="brand auth-brand">
          <div className="brand-mark" aria-hidden="true">C</div>
          <div className="brand-name">Contractor CRM</div>
        </div>
        <h1>{title}</h1>
        {sub && <p className="auth-sub">{sub}</p>}
        {children}
      </div>
      {footer && <div className="auth-foot">{footer}</div>}
    </main>
  );
}

function ExploreLink({ onExplore }) {
  return (
    <button type="button" className="link-btn" onClick={onExplore}>
      Look around with sample data instead (nothing is saved)
    </button>
  );
}

export function SetupScreen({ onExplore }) {
  const [pw, setPw] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const len = passwordLength(pw);
  const mismatch = again.length > 0 && again !== pw;

  const submit = async (e) => {
    e.preventDefault();
    if (len < MIN) return setError(`Use at least ${MIN} characters. A short sentence works well.`);
    if (len > MAX) return setError(`Use no more than ${MAX} characters.`);
    if (pw !== again) return setError("The two passwords don't match.");
    setBusy(true);
    setError('');
    try {
      await api().setUpPassword(pw);
      // The app reloads itself, unlocked. Keep the busy state until it does.
    } catch (err) {
      setError(reason(err));
      setBusy(false);
    }
  };

  return (
    <AuthCard
      title="Create your password"
      sub="Everything you save is encrypted on this computer with this password. You'll enter it each time you open the app."
      footer={<ExploreLink onExplore={onExplore} />}
    >
      <form onSubmit={submit} className="auth-form" noValidate>
        <PasswordField
          id="new-password"
          label="Password"
          value={pw}
          onChange={(v) => { setPw(v); setError(''); }}
          autoComplete="new-password"
          autoFocus
          hint={
            <small className={'pw-count' + (len >= MIN ? ' is-ok' : '')} aria-live="polite">
              {len >= MIN ? `${len} characters, long enough` : `${len} of ${MIN} characters. Try a few random words, like "maple ladder orbit canoe".`}
            </small>
          }
        />
        <PasswordField
          id="confirm-password"
          label="Type it again"
          value={again}
          onChange={(v) => { setAgain(v); setError(''); }}
          autoComplete="new-password"
          invalid={mismatch}
          hint={mismatch ? <small className="field-error">Doesn't match yet.</small> : null}
        />
        <p className="auth-warning">
          <strong>There is no password reset.</strong> If the password is lost, the data can't be recovered by anyone.
          Keep it in a password manager or somewhere safe.
        </p>
        {error && <p className="save-error" role="alert">{error}</p>}
        <button className="btn-primary auth-submit" disabled={busy}>
          {busy ? 'Setting up…' : 'Create password and open'}
        </button>
      </form>
    </AuthCard>
  );
}

export function LoginScreen({ onExplore, locked }) {
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [waitUntil, setWaitUntil] = useState(0);
  const [now, setNow] = useState(Date.now());

  // Count down when too many wrong guesses make the app wait.
  useEffect(() => {
    if (waitUntil <= now) return;
    const t = setTimeout(() => setNow(Date.now()), 250);
    return () => clearTimeout(t);
  }, [waitUntil, now]);
  const secondsLeft = Math.max(0, Math.ceil((waitUntil - now) / 1000));

  const submit = async (e) => {
    e.preventDefault();
    if (!pw || busy || secondsLeft) return;
    setBusy(true);
    setError('');
    let result;
    try {
      result = await api().login(pw);
    } catch (err) {
      result = { ok: false, error: reason(err) };
    }
    if (result && result.ok) return; // the app reloads itself, unlocked
    const msg = (result && result.error) || 'Incorrect password.';
    const wait = /wait (\d+) seconds?/i.exec(msg);
    // A wrong guess makes the next one wait (1s, 2s, 4s… up to a minute).
    setWaitUntil(Date.now() + (wait ? Number(wait[1]) * 1000 : 1000));
    setNow(Date.now());
    setError(wait ? 'Too many wrong tries.' : msg);
    setPw('');
    setBusy(false);
  };

  return (
    <AuthCard
      title={locked ? 'Locked' : 'Welcome back'}
      sub={locked ? 'The app locked to keep your data private. Enter your password to continue.' : 'Enter your password to open your contacts.'}
      footer={<ExploreLink onExplore={onExplore} />}
    >
      <form onSubmit={submit} className="auth-form" noValidate>
        <PasswordField
          id="password"
          label="Password"
          value={pw}
          onChange={(v) => { setPw(v); setError(''); }}
          autoComplete="current-password"
          autoFocus
          invalid={!!error}
        />
        {error && <p className="save-error" role="alert">{error}</p>}
        <button className="btn-primary auth-submit" disabled={busy || !pw || secondsLeft > 0}>
          {busy ? 'Unlocking…' : secondsLeft ? `Try again in ${secondsLeft}s` : 'Unlock'}
        </button>
        <p className="muted small auth-note">Forgot it? There's no reset. The data can only be opened with the password it was created with.</p>
      </form>
    </AuthCard>
  );
}
