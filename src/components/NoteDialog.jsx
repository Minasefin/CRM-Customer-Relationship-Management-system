import { useState } from 'react';
import { createPortal } from 'react-dom';
import RichTextArea from './RichTextArea.jsx';
import { SaveError, errorText } from './formBits.jsx';

// Pop-up for writing a note about one person, from anywhere (Home's Add note buttons).
// Save note first, Cancel second, like every pop-up in the app. Cmd/Ctrl+Enter saves.
export default function NoteDialog({ contact, onSave, onClose }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const name = `${contact.firstName} ${contact.lastName}`;

  const save = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      await onSave(contact.id, text.trim());
      onClose(true);
    } catch (err) {
      setError(errorText(err)); // keep what they typed
      setBusy(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      save();
    }
    // Escape closes only when nothing has been typed, so a note is never lost by accident.
    if (e.key === 'Escape' && !text.trim()) onClose(false);
  };

  return createPortal(
    <div className="dialog-root" onKeyDown={onKeyDown}>
      <div className="drawer-scrim" onClick={() => !text.trim() && onClose(false)} />
      <div className="dialog dialog-wide note-dialog" role="dialog" aria-modal="true" aria-labelledby="note-dialog-title">
        <h2 id="note-dialog-title">Add a note for {name}</h2>
        <p className="muted small">Saved with today's date and time. Cmd + Enter to save.</p>
        <RichTextArea
          rows={5}
          value={text}
          autoFocus
          onChange={(e) => {
            setText(e.target.value);
            setError('');
          }}
          placeholder={`What did you and ${contact.firstName} talk about?`}
          aria-label={`Note about ${name}`}
        />
        <SaveError message={error} />
        <div className="btn-row">
          <button className="btn-primary" onClick={save} disabled={busy || !text.trim()}>{busy ? 'Saving…' : 'Save note'}</button>
          <button className="btn-ghost" onClick={() => onClose(false)}>Cancel</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
