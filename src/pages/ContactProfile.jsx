import { useState } from 'react';
import { Avatar } from '../components/ContactCard.jsx';
import Icon from '../components/Icon.jsx';
import { freshness, formatDate, relativeDays } from '../lib/freshness.js';
import { useSettings } from '../hooks/useSettings.js';

const money = (n) => n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

const formatDateTime = (iso) =>
  new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

const statusLabel = { active: 'Active', inactive: 'Left / inactive', deceased: 'Deceased' };

export default function ContactProfile({ contact, org, contracts, onBack, onAddNote, onSetStatus }) {
  const [settings] = useSettings();
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(null); // status waiting for confirmation

  if (!contact) return null;
  const f = freshness(contact, settings);
  const notes = [...contact.notes].sort((a, b) => (a.at < b.at ? 1 : -1));
  const theirContracts = contracts.filter((k) => k.contactId === contact.id);
  const archived = contact.status !== 'active';
  const digits = (contact.phone || '').replace(/[^\d+]/g, '');

  const saveNote = async (e) => {
    e.preventDefault();
    if (!draft.trim()) return;
    setSaving(true);
    await onAddNote(contact.id, draft.trim());
    setDraft('');
    setSaving(false);
  };

  const changeStatus = async (status) => {
    await onSetStatus(contact.id, status);
    setConfirm(null);
  };

  return (
    <div className="profile">
      <button className="back" onClick={onBack}>
        <Icon name="back" size={16} /> Back
      </button>

      <header className="profile-head">
        <Avatar contact={contact} f={f} size="lg" />
        <div className="profile-id">
          <h1>{contact.firstName} {contact.lastName}</h1>
          <p className="profile-role">{contact.title}{org && <> at <strong>{org.name}</strong></>}</p>
          {archived ? (
            <p className={`status-pill status-${contact.status}`}>{statusLabel[contact.status]}</p>
          ) : f.level === 'never' ? (
            <p className="last-contacted level-never">Not contacted yet</p>
          ) : (
            <p className={`last-contacted level-${f.level}`}>
              <span className="dot" aria-hidden="true" />
              Last contacted {formatDate(f.last)}, {relativeDays(f.days)}
            </p>
          )}
        </div>
        {digits && (
          <div className="quick-actions">
            <a className="btn-soft" href={`tel:${digits}`}><Icon name="phone" size={16} /> Call</a>
            <a className="btn-soft" href={`sms:${digits}`}><Icon name="message" size={16} /> Text</a>
          </div>
        )}
      </header>

      <div className="profile-body">
        <section className="panel notes-panel">
          <h2>Notes</h2>
          <form className="note-form" onSubmit={saveNote}>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={`What did you and ${contact.firstName} talk about?`}
              rows={3}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveNote(e);
              }}
            />
            <div className="note-form-foot">
              <span className="muted small">Saved with today's date and time. Cmd + Enter to save.</span>
              <button className="btn-primary" disabled={!draft.trim() || saving}>Save note</button>
            </div>
          </form>

          {notes.length === 0 ? (
            <p className="muted empty-notes">No notes yet. Your first note sets the last contacted date.</p>
          ) : (
            <ol className="timeline">
              {notes.map((n) => (
                <li key={n.id}>
                  <time dateTime={n.at}>{formatDateTime(n.at)}</time>
                  <p>{n.text}</p>
                </li>
              ))}
            </ol>
          )}
        </section>

        <aside className="profile-side">
          <section className="panel">
            <h2>Contact info</h2>
            <dl className="facts">
              <dt>Phone</dt>
              <dd>{contact.phone || '—'}</dd>
              <dt>Email</dt>
              <dd>{contact.email ? <a href={`mailto:${contact.email}`}>{contact.email}</a> : '—'}</dd>
              <dt>Organization</dt>
              <dd>{org ? `${org.name}, ${org.city}` : '—'}</dd>
              <dt>Added</dt>
              <dd>{formatDate(contact.createdAt)}</dd>
            </dl>
          </section>

          {contact.skills.length > 0 && (
            <section className="panel">
              <h2>Skills</h2>
              <ul className="skills skills-left">
                {contact.skills.map((s) => <li key={s}>{s}</li>)}
              </ul>
            </section>
          )}

          <section className="panel">
            <h2>Contracts</h2>
            {theirContracts.length === 0 ? (
              <p className="muted small">No contracts yet.</p>
            ) : (
              <ul className="contract-list">
                {theirContracts.map((k) => (
                  <li key={k.id}>
                    <div className="contract-title">{k.title}</div>
                    <div className="muted small">{k.location}, {money(k.value)}</div>
                    <span className={`status-pill status-${k.status}`}>{k.status === 'active' ? 'On contract' : 'Completed'}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel">
            <h2>Status</h2>
            <p className="muted small">Records are never deleted. Archived people move to the Archived page.</p>
            {confirm ? (
              <div className="confirm">
                <p>
                  Mark {contact.firstName} as <strong>{statusLabel[confirm].toLowerCase()}</strong>?
                </p>
                <div className="confirm-actions">
                  <button className="btn-ghost" onClick={() => setConfirm(null)}>Cancel</button>
                  <button className="btn-primary" onClick={() => changeStatus(confirm)}>Yes, mark {statusLabel[confirm].toLowerCase()}</button>
                </div>
              </div>
            ) : (
              <div className="status-actions">
                {['active', 'inactive', 'deceased']
                  .filter((s) => s !== contact.status)
                  .map((s) => (
                    <button key={s} className="btn-ghost" onClick={() => setConfirm(s)}>
                      Mark {statusLabel[s].toLowerCase()}
                    </button>
                  ))}
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
