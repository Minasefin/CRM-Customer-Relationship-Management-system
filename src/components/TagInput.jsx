import { useState } from 'react';
import Icon from './Icon.jsx';

// Type a skill and press Enter. Suggests skills already used elsewhere so the
// same skill isn't spelled three different ways (which would break search).
export default function TagInput({ id, value, onChange, suggestions = [], placeholder }) {
  const [text, setText] = useState('');
  const q = text.trim().toLowerCase();
  const matches = q
    ? suggestions.filter((s) => s.toLowerCase().includes(q) && !value.some((v) => v.toLowerCase() === s.toLowerCase())).slice(0, 6)
    : [];

  const add = (raw) => {
    const t = raw.trim();
    if (!t) return;
    // Reuse the existing spelling if it matches one that's already in use.
    const existing = suggestions.find((s) => s.toLowerCase() === t.toLowerCase());
    const tag = existing || t;
    if (!value.some((v) => v.toLowerCase() === tag.toLowerCase())) onChange([...value, tag]);
    setText('');
  };

  return (
    <div className="tag-input">
      <div className="tag-box">
        {value.map((t) => (
          <span key={t} className="tag">
            {t}
            <button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(value.filter((v) => v !== t))}>
              <Icon name="close" size={12} />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={text}
          placeholder={value.length ? '' : placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              add(matches[0] && matches[0].toLowerCase().startsWith(q) ? matches[0] : text);
            } else if (e.key === 'Backspace' && !text && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={() => add(text)}
        />
      </div>
      {matches.length > 0 && (
        <div className="tag-suggest" role="listbox">
          {matches.map((m) => (
            <button type="button" key={m} onMouseDown={(e) => e.preventDefault()} onClick={() => add(m)}>
              {m}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
