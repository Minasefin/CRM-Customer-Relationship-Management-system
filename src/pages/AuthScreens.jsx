// First-time setup and sign-in. Shown before the app when the real database is locked.
// Nic's functions do the work (auth/README.md). On success the app reloads itself
// with the unlocked data, so these screens never hold contact data.
import { useEffect, useState } from 'react';
import PasswordField, { passwordLength } from '../components/PasswordField.jsx';
import Logo from '../components/Logo.jsx';
import { cleanCode } from '../components/TwoStep.jsx';
import { ShowRecoveryKey } from '../components/RecoveryKey.jsx';

const MIN = 15;
const MAX = 128;
const api = () => window.crm.api;
const reason = (e) => (e && (e.userMessage || e.message)) || 'That did not work. Try again.';

function AuthCard({ title, sub, children, footer }) {
  return (
    <main className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <Logo size={72} />
          <div className="auth-brand-name">Auria</div>
          <div className="auth-brand-tag">Your Network. Secured.</div>
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
          <strong>Nobody can reset this password for you.</strong> After this, make a recovery key in Settings → Security: it's the only way to choose a new password if you forget this one.
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

// Forgot the password: recovery key (+ 2FA code if it's on) and a new password.
// On success the session is unlocked, the NEW recovery key is shown once, then the app reloads.
function ResetPassword({ twoStep, onBack, onExplore }) {
  const [key, setKey] = useState('');
  const [pw, setPw] = useState('');
  const [again, setAgain] = useState('');
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [hasKey, setHasKey] = useState(null);
  useEffect(() => {
    api().getRecoveryStatus?.().then((st) => setHasKey(!!(st && st.enabled))).catch(() => setHasKey(true));
  }, []);
  const len = passwordLength(pw);
  const submit = async (e) => {
    e.preventDefault();
    if (!key.trim()) return setError('Enter your recovery key.');
    if (len < MIN) return setError(`Use at least ${MIN} characters for the new password.`);
    if (pw !== again) return setError("The two passwords don't match.");
    if (twoStep && !cleanCode(code)) return setError(recovery ? 'Enter a 2FA recovery code.' : 'Enter the 6-digit code from your authenticator app.');
    setBusy(true);
    setError('');
    let r;
    try {
      r = await api().resetPasswordWithRecoveryKey(key, pw, twoStep ? cleanCode(code) : undefined);
    } catch (err) {
      r = { ok: false, error: reason(err) };
    }
    setBusy(false);
    if (r && r.ok) return setNewKey(r.recoveryKey);
    setError((r && r.error) || 'That did not work. Try again.');
    setCode('');
  };
  if (newKey)
    return (
      <AuthCard title="Password changed" sub="Your old recovery key no longer works. Here's your new one.">
        <ShowRecoveryKey recoveryKey={newKey} intro="" doneLabel="Open Auria" onDone={() => location.reload()} />
      </AuthCard>
    );
  if (hasKey === false)
    return (
      <AuthCard title="Forgot your password?" sub="No recovery key was made for this data, so the password can't be reset. Not even we can open it without the password." footer={<ExploreLink onExplore={onExplore} />}>
        <button type="button" className="btn-primary auth-submit" onClick={onBack}>Back to sign in</button>
      </AuthCard>
    );
  return (
    <AuthCard title="Reset your password" sub="Use the recovery key you saved when you made it in Settings." footer={<ExploreLink onExplore={onExplore} />}>
      <form onSubmit={submit} className="auth-form" noValidate>
        <label className="field" htmlFor="recovery-key">
          <span>Recovery key</span>
          <input id="recovery-key" value={key} onChange={(e) => { setKey(e.target.value); setError(''); }} placeholder="XXXX-XXXX-XXXX-…" autoComplete="off" spellCheck={false} autoFocus className="code-input" />
        </label>
        <PasswordField
          id="reset-password"
          label="New password"
          value={pw}
          onChange={(v) => { setPw(v); setError(''); }}
          autoComplete="new-password"
          hint={<small className={'pw-count' + (len >= MIN ? ' is-ok' : '')}>{len >= MIN ? `${len} characters, long enough` : `${len} of ${MIN} characters`}</small>}
        />
        <PasswordField id="reset-again" label="Type it again" value={again} onChange={(v) => { setAgain(v); setError(''); }} autoComplete="new-password" invalid={again.length > 0 && again !== pw} />
        {twoStep && (
          <div className="auth-code">
            <label className="field" htmlFor="reset-code">
              <span>{recovery ? '2FA recovery code' : '6-digit code from your authenticator app'}</span>
              <input id="reset-code" value={code} onChange={(e) => { setCode(e.target.value); setError(''); }} inputMode={recovery ? 'text' : 'numeric'} autoComplete="one-time-code" maxLength={recovery ? 48 : 7} placeholder={recovery ? '32 letters and numbers' : '123456'} spellCheck={false} className="code-input" />
            </label>
            <button type="button" className="link-btn" onClick={() => { setRecovery(!recovery); setCode(''); }}>
              {recovery ? 'Use the app instead' : "Don't have your phone? Use a 2FA recovery code"}
            </button>
          </div>
        )}
        {error && <p className="save-error" role="alert">{error}</p>}
        <button className="btn-primary auth-submit" disabled={busy}>{busy ? 'Resetting…' : 'Reset password'}</button>
        <button type="button" className="link-btn auth-back" onClick={onBack}>Back to sign in</button>
      </form>
    </AuthCard>
  );
}

export function LoginScreen({ onExplore, locked }) {
  const [resetting, setResetting] = useState(false);
  const [pw, setPw] = useState('');
  const [code, setCode] = useState('');
  const [twoStep, setTwoStep] = useState(false); // two-step sign-in is on: ask for a code too
  const [recovery, setRecovery] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [waitUntil, setWaitUntil] = useState(0);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    api().getTotpStatus?.().then((st) => setTwoStep(!!(st && st.enabled))).catch(() => {});
  }, []);

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
    if (twoStep && !cleanCode(code)) return setError(recovery ? 'Enter a recovery code.' : 'Enter the 6-digit code from your authenticator app.');
    setBusy(true);
    setError('');
    let result;
    try {
      result = twoStep ? await api().loginWithTotp(pw, cleanCode(code)) : await api().login(pw);
    } catch (err) {
      result = { ok: false, error: reason(err) };
    }
    if (result && result.ok) return; // the app reloads itself, unlocked
    const msg = (result && result.error) || 'Incorrect password.';
    const wait = /wait (\d+) seconds?/i.exec(msg);
    // 2FA was turned on elsewhere (or this screen didn't know yet): show the code field.
    if (!twoStep && /authenticator or recovery code/i.test(msg)) setTwoStep(true);
    // A wrong guess makes the next one wait (1s, 2s, 4s… up to a minute).
    setWaitUntil(Date.now() + (wait ? Number(wait[1]) * 1000 : 1000));
    setNow(Date.now());
    setError(wait ? 'Too many wrong tries.' : /authenticator or recovery code/i.test(msg) ? (twoStep ? "That code didn't work. Use the newest one from the app." : 'Enter the 6-digit code from your authenticator app.') : msg);
    // Keep the password if only the code was wrong.
    if (!/authenticator or recovery code/i.test(msg)) setPw('');
    setCode('');
    setBusy(false);
  };

  if (resetting) return <ResetPassword twoStep={twoStep} onBack={() => setResetting(false)} onExplore={onExplore} />;
  return (
    <AuthCard
      title={locked ? 'Locked' : 'Welcome back'}
      sub={(locked ? 'The app locked to keep your data private. ' : '') + (twoStep ? 'Enter your password and the code from your phone.' : locked ? 'Enter your password to continue.' : 'Enter your password to open your contacts.')}
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
          invalid={!!error && !twoStep}
        />
        {twoStep && (
          <div className="auth-code">
            <label className="field" htmlFor="signin-code">
              <span>{recovery ? 'Recovery code' : '6-digit code from your authenticator app'}</span>
              <input
                id="signin-code"
                value={code}
                onChange={(e) => { setCode(e.target.value); setError(''); }}
                inputMode={recovery ? 'text' : 'numeric'}
                autoComplete="one-time-code"
                maxLength={recovery ? 48 : 7}
                placeholder={recovery ? '32 letters and numbers' : '123456'}
                spellCheck={false}
                className="code-input"
              />
            </label>
            <button type="button" className="link-btn" onClick={() => { setRecovery(!recovery); setCode(''); setError(''); }}>
              {recovery ? 'Use the app instead' : "Don't have your phone? Use a recovery code"}
            </button>
          </div>
        )}
        {error && <p className="save-error" role="alert">{error}</p>}
        <button className="btn-primary auth-submit" disabled={busy || !pw || secondsLeft > 0}>
          {busy ? 'Unlocking…' : secondsLeft ? `Try again in ${secondsLeft}s` : 'Unlock'}
        </button>
        <button type="button" className="link-btn auth-forgot" onClick={() => setResetting(true)}>Forgot your password?</button>
      </form>
    </AuthCard>
  );
}
