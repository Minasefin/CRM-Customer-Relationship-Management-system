import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
// Small shared pieces for the forms.

export const sameName = (a = '', b = '') => a.trim().toLowerCase() === b.trim().toLowerCase() && a.trim() !== '';

export const orgInitials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

// The plain-English reason a save failed. The database puts a safe message on e.userMessage.
export const errorText = (e) => (e && (e.userMessage || e.message)) || "Couldn't save. Try again.";

// Shown above a form's buttons when a save fails. The form stays open so nothing typed is lost.
export function SaveError({ message }) {
  if (!message) return null;
  return <p className="save-error" role="alert">{message}</p>;
}

// Pop-up when someone closes a form with unsaved changes.
// Main action first (Save), then Discard, then Keep editing, like every confirm in the app.
// Escape or clicking outside = keep editing.
export function UnsavedDialog({ onSave, onDiscard, onKeep }) {
  const main = useRef(null);
  useEffect(() => {
    main.current?.focus();
  }, []);
  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation(); // don't let the form's own Escape close it
      onKeep();
    }
  };
  // Rendered on top of everything (not inside the form panel), so nothing can cover it.
  return createPortal(
    <div className="dialog-root" onKeyDown={onKeyDown}>
      <div className="drawer-scrim" onClick={onKeep} />
      <div className="dialog dialog-wide" role="alertdialog" aria-modal="true" aria-labelledby="unsaved-title" aria-describedby="unsaved-text">
        <h2 id="unsaved-title">Save your changes?</h2>
        <p id="unsaved-text" className="muted">You changed this form but haven't saved it.</p>
        <div className="btn-row">
          <button ref={main} className="btn-primary" onClick={onSave}>Save changes</button>
          <button className="btn-ghost" onClick={onDiscard}>Discard changes</button>
          <button className="btn-ghost" onClick={onKeep}>Keep editing</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
