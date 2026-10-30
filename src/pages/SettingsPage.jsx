import { useState } from 'react';
import { useSettings } from '../hooks/useSettings.js';
import PasswordField, { passwordLength } from '../components/PasswordField.jsx';

function Toggle({ id, checked, onChange, disabled }) {
  return (
    <button
      id={id}
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={'toggle' + (checked ? ' is-on' : '')}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle-knob" />
    </button>
  );
}

// Change password. The database is re-encrypted with the new one; nothing else changes.
function ChangePassword() {
  const blank = { current: '', next: '', again: '' };
  const [f, setF] = useState(blank);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const set = (k) => (v) => { setF({ ...f, [k]: v }); setError(''); setDone(''); };
  const len = passwordLength(f.next);

  const cancel = () => { setF(blank); setError(''); setOpen(false); };
  const submit = async (e) => {
    e.preventDefault();
    if (!f.current) return setError('Enter your current password.');
    if (len < 15) return setError('Use at least 15 characters for the new password.');
    if (f.next !== f.again) return setError("The new passwords don't match.");
    setBusy(true);
    let result;
    try {
      result = await window.crm.api.changePassword(f.current, f.next);
    } catch (err) {
      result = { ok: false, error: (err && (err.userMessage || err.message)) || 'That did not work. Try again.' };
    }
    setBusy(false);
    if (result && result.ok) {
      setF(blank);
      setOpen(false);
      setDone('Password changed. Use the new one next time you unlock.');
    } else {
      setF({ ...f, current: '' });
      setError((result && result.error) || 'That did not work. Try again.');
    }
  };

  if (!open) {
    return (
      <div className="setting-row">
        <div>
          <span className="setting-label">Password</span>
          <p className="muted small">{done || 'Your password encrypts everything saved in the app.'}</p>
        </div>
        <button className="btn-ghost" onClick={() => { setOpen(true); setDone(''); }}>Change password</button>
      </div>
    );
  }
  return (
    <form className="setting-row change-password" onSubmit={submit} noValidate>
      <div className="change-password-fields">
        <span className="setting-label">Change password</span>
        <PasswordField id="current-password" label="Current password" value={f.current} onChange={set('current')} autoComplete="current-password" autoFocus />
        <PasswordField
          id="next-password"
          label="New password"
          value={f.next}
          onChange={set('next')}
          autoComplete="new-password"
          hint={<small className={'pw-count' + (len >= 15 ? ' is-ok' : '')}>{len >= 15 ? `${len} characters, long enough` : `${len} of 15 characters`}</small>}
        />
        <PasswordField id="again-password" label="Type the new one again" value={f.again} onChange={set('again')} autoComplete="new-password" invalid={f.again.length > 0 && f.again !== f.next} />
        {error && <p className="save-error" role="alert">{error}</p>}
        <div className="btn-row">
          <button className="btn-primary" disabled={busy}>{busy ? 'Changing…' : 'Change password'}</button>
          <button type="button" className="btn-ghost" onClick={cancel}>Cancel</button>
        </div>
      </div>
    </form>
  );
}

const hours = Array.from({ length: 24 }, (_, h) => ({
  value: h,
  label: new Date(2000, 0, 1, h).toLocaleTimeString(undefined, { hour: 'numeric' }),
}));

function HourSelect({ value, onChange, disabled, label }) {
  return (
    <select aria-label={label} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))}>
      {hours.map((h) => (
        <option key={h.value} value={h.value}>{h.label}</option>
      ))}
    </select>
  );
}

export default function SettingsPage({ theme, canLock = false }) {
  const [s, update] = useSettings();

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Settings</h1>
          <p className="page-sub">Changes save automatically.</p>
        </div>
      </header>

      <section className="settings-group">
        <h2>Appearance</h2>

        <div className="setting-row">
          <div>
            <label htmlFor="auto-theme" className="setting-label">Switch light and dark mode by time of day</label>
            <p className="muted small">Right now it's in {theme} mode. Clicking the mode at the bottom of the sidebar switches it until the next scheduled change.</p>
          </div>
          <Toggle id="auto-theme" checked={s.autoTheme} onChange={(v) => update({ autoTheme: v, manualTheme: theme, override: null })} />
        </div>

        <div className={'setting-row' + (s.autoTheme ? '' : ' is-disabled')}>
          <div>
            <span className="setting-label">Light mode hours</span>
            <p className="muted small">Dark mode runs the rest of the day.</p>
          </div>
          <div className="hour-range">
            <HourSelect label="Light mode starts" value={s.lightFrom} disabled={!s.autoTheme} onChange={(v) => update({ lightFrom: v, override: null })} />
            <span className="muted">to</span>
            <HourSelect label="Dark mode starts" value={s.darkFrom} disabled={!s.autoTheme} onChange={(v) => update({ darkFrom: v, override: null })} />
          </div>
        </div>

        <div className={'setting-row' + (s.autoTheme ? ' is-disabled' : '')}>
          <div>
            <label htmlFor="dark-mode" className="setting-label">Dark mode</label>
            <p className="muted small">Turn off the time-of-day switch to choose yourself.</p>
          </div>
          <Toggle id="dark-mode" checked={s.manualTheme === 'dark'} disabled={s.autoTheme} onChange={(v) => update({ manualTheme: v ? 'dark' : 'light' })} />
        </div>
      </section>

      <section className="settings-group">
        <h2>Check-in reminders</h2>
        <div className="setting-row">
          <div>
            <label htmlFor="stale" className="setting-label">Mark as getting stale after</label>
            <p className="muted small">The ring around a contact's photo turns yellow.</p>
          </div>
          <div className="days-input">
            <input id="stale" type="number" min="1" value={s.staleAfter} onChange={(e) => update({ staleAfter: Math.max(1, Number(e.target.value) || 1) })} />
            <span className="muted">days</span>
          </div>
        </div>
        <div className="setting-row">
          <div>
            <label htmlFor="overdue" className="setting-label">Mark as overdue after</label>
            <p className="muted small">The ring turns red and the person shows under Overdue.</p>
          </div>
          <div className="days-input">
            <input id="overdue" type="number" min="2" value={s.overdueAfter} onChange={(e) => update({ overdueAfter: Math.max(s.staleAfter + 1, Number(e.target.value) || 2) })} />
            <span className="muted">days</span>
          </div>
        </div>
      </section>

      <section className="settings-group">
        <h2>Security</h2>
        {canLock ? (
          <>
            <div className="setting-row">
              <div>
                <span className="setting-label">Automatic lock</span>
                <p className="muted small">The app locks after 15 minutes without use, and right away when the computer sleeps or its screen locks.</p>
              </div>
              <button className="btn-ghost" onClick={() => window.crm.api.logout()}>Lock now</button>
            </div>
            <ChangePassword />
          </>
        ) : (
          <div className="setting-row is-disabled">
            <div>
              <span className="setting-label">Password and automatic lock</span>
              <p className="muted small">Available when you're signed in to your saved data. Sample data has no password.</p>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
