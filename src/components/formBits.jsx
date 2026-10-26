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
