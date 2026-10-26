import { useRef, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { Avatar } from '../components/ContactCard.jsx';
import { freshness, formatDate, relativeDays, daysSince } from '../lib/freshness.js';
import { useSettings } from '../hooks/useSettings.js';

const money = (n) => (n || 0).toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const DAY = 24 * 60 * 60 * 1000;

// "What do I do today?" Who needs a call, contracts to watch, latest notes, and a quick note box.
export default function HomePage({ contacts, contracts, orgsById, contactsById, onOpen, onAddNote, onEditContract, onNavigate }) {
  const [settings] = useSettings();
  const [noteFor, setNoteFor] = useState('');
  const [text, setText] = useState('');
  const [saved, setSaved] = useState('');
  const box = useRef(null);

  const active = contacts.filter((c) => c.status === 'active');
  const withF = active.map((c) => ({ c, f: freshness(c, settings) }));
  const toCall = withF
    .filter(({ f }) => f.level === 'overdue' || f.level === 'never' || f.level === 'stale')
    .sort((a, b) => {
      const rank = { never: 0, overdue: 1, stale: 2 };
      return rank[a.f.level] - rank[b.f.level] || (b.f.days ?? 0) - (a.f.days ?? 0);
    });
  const overdueCount = toCall.filter(({ f }) => f.level !== 'stale').length;

  const now = Date.now();
  const activeContracts = contracts
    .filter((k) => k.status === 'active')
    .map((k) => ({ k, daysLeft: k.end ? Math.ceil((new Date(k.end).getTime() - now) / DAY) : null }))
    .sort((a, b) => (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity));
  const endingSoon = activeContracts.filter((x) => x.daysLeft !== null && x.daysLeft <= 30).length;

  const latest = active
    .flatMap((c) => c.notes.map((n) => ({ ...n, c })))
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, 6);

  const people = [...active].sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));

  const startNote = (id) => {
    setNoteFor(id);
    setSaved('');
    box.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => box.current?.querySelector('textarea')?.focus(), 50);
  };

  const save = async (e) => {
    e.preventDefault();
    if (!noteFor || !text.trim()) return;
    await onAddNote(noteFor, text.trim());
    const p = contactsById[noteFor];
    setSaved(`Saved a note for ${p.firstName} ${p.lastName}.`);
    setText('');
    setNoteFor('');
  };

  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const summary = [
    overdueCount ? `${overdueCount} ${overdueCount === 1 ? 'person needs' : 'people need'} a check-in` : 'Everyone is up to date',
    endingSoon ? `${endingSoon} ${endingSoon === 1 ? 'contract ends' : 'contracts end'} in the next 30 days` : null,
  ].filter(Boolean).join('. ');

  return (
    <>
      <header className="page-head">
        <div>
          <h1>{today}</h1>
          <p className="page-sub">{summary}.</p>
        </div>
      </header>

      <div className="home-grid">
        <section className="panel">
          <div className="panel-head">
            <h2>Who to call</h2>
            <button className="link-btn" onClick={() => onNavigate('contacts')}>All contacts</button>
          </div>
          {toCall.length === 0 ? (
            <p className="muted">Nobody is overdue. Nice work.</p>
          ) : (
            <ul className="call-list">
              {toCall.slice(0, 8).map(({ c, f }) => {
                const phone = (c.phones?.[0]?.number || '').replace(/[^\d+]/g, '');
                return (
                  <li key={c.id}>
                    <button className="call-person" onClick={() => onOpen(c.id)}>
                      <Avatar contact={c} f={f} size="sm" />
                      <span>
                        <strong>{c.firstName} {c.lastName}</strong>
                        <span className={`call-when level-${f.level}`}>
                          {f.level === 'never' ? 'Never contacted' : `Last contacted ${relativeDays(f.days)}`}
                        </span>
                        <span className="muted small">{c.orgId ? orgsById[c.orgId]?.name : 'Independent'}</span>
                      </span>
                    </button>
                    <div className="call-actions">
                      {phone && <a className="btn-soft btn-sm" href={`tel:${phone}`}><Icon name="phone" size={14} /> Call</a>}
                      <button className="btn-ghost btn-sm" onClick={() => startNote(c.id)}>Add note</button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {toCall.length > 8 && <p className="muted small">And {toCall.length - 8} more on the Contacts page.</p>}
        </section>

        <div className="home-side">
          <section className="panel" ref={box}>
            <h2>Quick note</h2>
            <form className="note-form" onSubmit={save}>
              <label className="field">
                <span>Who did you talk to?</span>
                <select value={noteFor} onChange={(e) => { setNoteFor(e.target.value); setSaved(''); }}>
                  <option value="">Choose a person…</option>
                  {people.map((c) => (
                    <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
                  ))}
                </select>
              </label>
              <textarea
                rows={3}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="What did you talk about?"
                aria-label="Note"
                onKeyDown={(e) => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && save(e)}
              />
              <div className="note-form-foot">
                <span className="muted small">{saved || "Saved with today's date and time."}</span>
                <button className="btn-primary" disabled={!noteFor || !text.trim()}>Save note</button>
              </div>
            </form>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>Active contracts</h2>
              <button className="link-btn" onClick={() => onNavigate('contracts')}>All contracts</button>
            </div>
            {activeContracts.length === 0 ? (
              <p className="muted">No active contracts.</p>
            ) : (
              <ul className="contract-list">
                {activeContracts.slice(0, 5).map(({ k, daysLeft }) => {
                  const p = contactsById[k.contactId];
                  return (
                    <li key={k.id}>
                      <button className="contract-item" onClick={() => onEditContract(k.id)}>
                        <div className="contract-title">{k.title}</div>
                        <div className="muted small">
                          {p ? `${p.firstName} ${p.lastName}, ` : ''}{[k.location, money(k.value)].filter(Boolean).join(', ')}
                        </div>
                        {daysLeft !== null && daysLeft <= 30 ? (
                          <span className="status-pill status-ending">{daysLeft <= 0 ? 'Ends today' : `Ends in ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'}`}</span>
                        ) : (
                          <span className="muted small">{k.end ? `Ends ${formatDate(k.end)}` : `Since ${formatDate(k.start)}`}</span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="panel">
            <h2>Latest notes</h2>
            {latest.length === 0 ? (
              <p className="muted">No notes yet.</p>
            ) : (
              <ul className="people-list">
                {latest.map((n) => (
                  <li key={n.id} className="note-row">
                    <button className="link-btn" onClick={() => onOpen(n.c.id)}>{n.c.firstName} {n.c.lastName}</button>
                    <span className="muted small">{daysSince(n.at) === 0 ? 'Today' : formatDate(n.at)}</span>
                    <p className="note-text">{n.text}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
