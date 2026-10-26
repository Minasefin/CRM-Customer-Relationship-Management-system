import { useSettings } from '../hooks/useSettings.js';

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

export default function SettingsPage({ theme }) {
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
            <p className="muted small">Right now it's in {theme} mode.</p>
          </div>
          <Toggle id="auto-theme" checked={s.autoTheme} onChange={(v) => update({ autoTheme: v, manualTheme: theme })} />
        </div>

        <div className={'setting-row' + (s.autoTheme ? '' : ' is-disabled')}>
          <div>
            <span className="setting-label">Light mode hours</span>
            <p className="muted small">Dark mode runs the rest of the day.</p>
          </div>
          <div className="hour-range">
            <HourSelect label="Light mode starts" value={s.lightFrom} disabled={!s.autoTheme} onChange={(v) => update({ lightFrom: v })} />
            <span className="muted">to</span>
            <HourSelect label="Dark mode starts" value={s.darkFrom} disabled={!s.autoTheme} onChange={(v) => update({ darkFrom: v })} />
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
        <div className="setting-row is-disabled">
          <div>
            <span className="setting-label">Lock the app after inactivity</span>
            <p className="muted small">Coming with the login screen.</p>
          </div>
          <Toggle checked={false} disabled onChange={() => {}} />
        </div>
      </section>
    </>
  );
}
