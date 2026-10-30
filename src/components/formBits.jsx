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

// Shown in a form's footer when someone closes it with unsaved changes.
// Main action first, then the way out, same as every confirm in the app.
export function DiscardBar({ onDiscard, onKeep }) {
  return (
    <div className="discard-bar">
      <p>You have unsaved changes.</p>
      <div className="btn-row">
        <button className="btn-primary" onClick={onKeep}>Keep editing</button>
        <button className="btn-ghost" onClick={onDiscard}>Discard changes</button>
      </div>
    </div>
  );
}
