import { useState } from 'react';
import Icon from './Icon.jsx';

// Password box with a show/hide button. Paste is allowed on purpose (password managers).
export default function PasswordField({ label, value, onChange, autoComplete, autoFocus, invalid, hint, id }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="field password-field">
      <label htmlFor={id} className="field-label">{label}</label>
      <div className="password-box">
        <input
          id={id}
          type={shown ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          spellCheck={false}
          autoCapitalize="off"
          aria-invalid={invalid || undefined}
        />
        <button
          type="button"
          className="password-toggle"
          onClick={() => setShown(!shown)}
          aria-label={shown ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={shown}
        >
          <Icon name={shown ? 'eyeOff' : 'eye'} size={17} />
        </button>
      </div>
      {hint}
    </div>
  );
}

// Unicode-aware length, the same way the login code counts (emoji = 1 character).
export const passwordLength = (s) => [...s.normalize('NFC')].length;
