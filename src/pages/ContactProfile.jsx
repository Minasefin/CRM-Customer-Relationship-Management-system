import { useEffect, useState } from 'react';
import { Avatar } from '../components/ContactCard.jsx';
import Icon from '../components/Icon.jsx';
import { freshness, formatDate, relativeDays } from '../lib/freshness.js';
import { useSettings } from '../hooks/useSettings.js';
import { api } from '../api/index.js';

const money = (n) => n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

const formatDateTime = (iso) =>
  new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

const statusLabel = { active: 'Active', inactive: 'Left / inactive', deceased: 'Deceased' };
const socialLabel = { x: 'X', instagram: 'Instagram', snapchat: 'Snapchat', facebook: 'Facebook' };

export default function ContactProfile({ contact, org, orgsById, contracts, onBack, onEdit, onAddNote, onSetStatus, onAddContract, onEditContract, onOpenOrg }) {
  const [settings] = useSettings();
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(null); // status waiting for confirmation
  const [history, setHistory] = useState([]);

  useEffect(() => {
    if (contact) api.getEmploymentHistory(contact.id).then(setHistory);
  }, [contact?.id, contact?.orgId]);

  if (!contact) return null;
  const f = freshness(contact, settings);
  const notes = [...contact.notes].sort((a, b) => (a.at < b.at ? 1 : -1));
  const theirContracts = contracts.filter((k) => k.contactId === contact.id);
  const archived = contact.status !== 'active';
  const phones = contact.phones || [];
  const emails = contact.emails || [];
  const mainPhone = (phones[0]?.number || '').replace(/[^\d+]/g, '');
  const socialRows = Object.entries(contact.social || {}).filter(([, v]) => v);
  const jobs = [...history].sort((a, b) => (a.start < b.start ? 1 : -1));

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
          <p className="profile-role">
            {contact.title}
            {contact.title && ' at '}
            {org ? (
              <button className="inline-link" onClick={() => onOpenOrg(org.id)}>{org.name}</button>
            ) : (
              <strong>Independent</strong>
            )}
          </p>
          {!archived && (
            <p className={'avail-pill' + (theirContracts.some((k) => k.status === 'active') ? ' is-on' : '')}>
              {theirContracts.some((k) => k.status === 'active') ? 'On contract' : 'Available'}
            </p>
          )}
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
        <div className="quick-actions">
          {mainPhone && (
            <>
              <a className="btn-soft" href={`tel:${mainPhone}`}><Icon name="phone" size={16} /> Call</a>
              <a className="btn-soft" href={`sms:${mainPhone}`}><Icon name="message" size={16} /> Text</a>
            </>
          )}
          <button className="btn-ghost" onClick={onEdit}><Icon name="edit" size={15} /> Edit</button>
        </div>
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
              {phones.length === 0 && emails.length === 0 && !contact.address && (
                <>
                  <dt>Details</dt>
                  <dd className="muted">None yet. Use Edit to add them.</dd>
                </>
              )}
              {phones.map((p, i) => (
                <div className="fact" key={`p${i}`}>
                  <dt>{p.label}</dt>
                  <dd><a href={`tel:${p.number.replace(/[^\d+]/g, '')}`}>{p.number}</a></dd>
                </div>
              ))}
              {emails.map((m, i) => (
                <div className="fact" key={`m${i}`}>
                  <dt>{m.label} email</dt>
                  <dd><a href={`mailto:${m.address}`}>{m.address}</a></dd>
                </div>
              ))}
              {contact.address && (
                <div className="fact">
                  <dt>Address</dt>
                  <dd>{contact.address}</dd>
                </div>
              )}
              <div className="fact">
                <dt>Added</dt>
                <dd>{formatDate(contact.createdAt)}</dd>
              </div>
            </dl>
          </section>

          {(contact.spouse || contact.children?.length > 0) && (
            <section className="panel">
              <h2>Family</h2>
              <dl className="facts">
                {contact.spouse && (
                  <div className="fact">
                    <dt>Spouse</dt>
                    <dd>{contact.spouse}</dd>
                  </div>
                )}
                {contact.children?.length > 0 && (
                  <div className="fact">
                    <dt>Children</dt>
                    <dd>{contact.children.join(', ')}</dd>
                  </div>
                )}
              </dl>
            </section>
          )}

          {contact.skills.length > 0 && (
            <section className="panel">
              <h2>Skills</h2>
              <ul className="skills skills-left">
                {contact.skills.map((s) => <li key={s}>{s}</li>)}
              </ul>
            </section>
          )}

          <section className="panel">
            <h2>Work history</h2>
            {jobs.length === 0 ? (
              <p className="muted small">Independent. No organizations yet.</p>
            ) : (
              <ol className="jobs">
                {jobs.map((j) => (
                  <li key={j.id} className={j.end ? '' : 'is-current'}>
                    <div className="contract-title">{orgsById[j.orgId]?.name || 'Unknown organization'}</div>
                    <div className="muted small">
                      {formatDate(j.start)} to {j.end ? formatDate(j.end) : 'now'}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="panel">
            <h2>Contracts</h2>
            {theirContracts.length === 0 ? (
              <p className="muted small">No contracts yet.</p>
            ) : (
              <ul className="contract-list">
                {theirContracts.map((k) => (
                  <li key={k.id}>
                    <button className="contract-item" onClick={() => onEditContract(k.id)} aria-label={`Edit ${k.title}`}>
                      <div className="contract-title">{k.title}</div>
                      <div className="muted small">{[k.location, money(k.value)].filter(Boolean).join(', ')}</div>
                      <span className={`status-pill status-${k.status}`}>{k.status === 'active' ? 'On contract' : 'Completed'}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {!archived && (
              <button className="link-btn add-under" onClick={() => onAddContract(contact.id)}>
                <Icon name="plus" size={14} /> Add contract
              </button>
            )}
          </section>

          {socialRows.length > 0 && (
            <section className="panel">
              <h2>Social media</h2>
              <dl className="facts">
                {socialRows.map(([k, v]) => (
                  <div className="fact" key={k}>
                    <dt>{socialLabel[k] || k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          <section className="panel">
            <h2>Status</h2>
            <p className="muted small">Records are never deleted. Archived people move to the Archived page.</p>
            {confirm ? (
              <div className="confirm">
                <p>
                  Mark {contact.firstName} as <strong>{statusLabel[confirm].toLowerCase()}</strong>?
                </p>
                <div className="btn-row">
                  <button className="btn-primary" onClick={() => changeStatus(confirm)}>Yes, mark {statusLabel[confirm].toLowerCase()}</button>
                  <button className="btn-ghost" onClick={() => setConfirm(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <div className="btn-row status-actions">
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
