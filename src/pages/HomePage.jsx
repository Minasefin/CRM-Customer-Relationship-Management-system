import { useRef, useState } from 'react';
import { usePins } from '../lib/pins.js';
import Icon from '../components/Icon.jsx';
import { Avatar } from '../components/ContactCard.jsx';
import { freshness, formatDate, relativeDays, daysSince } from '../lib/freshness.js';
import { useSettings } from '../hooks/useSettings.js';
import { money } from '../lib/money.js';
import { SaveError, errorText } from '../components/formBits.jsx';
import RichTextArea from '../components/RichTextArea.jsx';
import { plainText } from '../lib/richText.jsx';

const DAY = 24 * 60 * 60 * 1000;

// The cards that can go on Home. "col" is where a card goes when it's added back.
export const HOME_CARDS = {
  call: { title: 'Who to call', col: 'main' },
  pinned: { title: 'Pinned contacts', col: 'main' },
  note: { title: 'Quick note', col: 'side' },
  contracts: { title: 'Active contracts', col: 'side' },
  ending: { title: 'Contracts ending soon', col: 'side' },
  week: { title: "This week's check-ins", col: 'main' },
  recent: { title: 'Recently added', col: 'side' },
  latest: { title: 'Latest notes', col: 'side' },
};
export const DEFAULT_HOME = { main: ['call', 'pinned'], side: ['note', 'contracts', 'latest'] };

// Saved layout, cleaned up: unknown cards dropped, each card at most once.
function readLayout(saved) {
  const seen = new Set();
  const clean = (list) => (Array.isArray(list) ? list : []).filter((id) => HOME_CARDS[id] && !seen.has(id) && seen.add(id));
  if (!saved || typeof saved !== 'object') return { main: [...DEFAULT_HOME.main], side: [...DEFAULT_HOME.side] };
  return { main: clean(saved.main), side: clean(saved.side) };
}

// "What do I do today?" A set of cards the user can show, hide and rearrange (Customize).
export default function HomePage({ contacts, contracts, orgsById, contactsById, onOpen, onAddNote, onEditContract, onNavigate }) {
  const [settings, updateSettings] = useSettings();
  const { pinned, togglePin } = usePins();
  const [customizing, setCustomizing] = useState(false);
  const [dragging, setDragging] = useState(null);
  const [noteFor, setNoteFor] = useState('');
  const [text, setText] = useState('');
  const [saved, setSaved] = useState('');
  const [noteError, setNoteError] = useState('');
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
    setNoteError('');
    try {
      await onAddNote(noteFor, text.trim());
    } catch (err) {
      return setNoteError(errorText(err)); // keep what they typed
    }
    const p = contactsById[noteFor];
    setSaved(`Saved a note for ${p.firstName} ${p.lastName}.`);
    setText('');
    setNoteFor('');
  };


  // Pinned, ending soon, this week, recently added
  const pinnedPeople = pinned.map((id) => contactsById[id]).filter(Boolean).map((c) => ({ c, f: freshness(c, settings) }));
  const endingList = activeContracts.filter((x) => x.daysLeft !== null && x.daysLeft <= 60);
  const weekStart = new Date();
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - 6);
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return { d, count: 0 };
  });
  let lastWeek = 0;
  contacts.forEach((c) =>
    c.notes.forEach((n) => {
      const t = new Date(n.at);
      const idx = Math.floor((t - weekStart) / DAY);
      if (idx >= 0 && idx < 7) week[idx].count++;
      else if (idx >= -7 && idx < 0) lastWeek++;
    }),
  );
  const weekTotal = week.reduce((s, x) => s + x.count, 0);
  const weekMax = Math.max(1, ...week.map((x) => x.count));
  const recent = active
    .filter((c) => c.createdAt && now - new Date(c.createdAt).getTime() <= 30 * DAY)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 6);

  // Layout: which cards show, in which column and order. Saved on this computer.
  const layout = readLayout(settings.home);
  const hidden = Object.keys(HOME_CARDS).filter((id) => !layout.main.includes(id) && !layout.side.includes(id));
  const saveLayout = (next) => updateSettings({ home: next });
  const where = (id) => (layout.main.includes(id) ? 'main' : 'side');
  const move = (id, delta) => {
    const col = where(id);
    const list = [...layout[col]];
    const i = list.indexOf(id);
    const j = i + delta;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    saveLayout({ ...layout, [col]: list });
  };
  const moveTo = (id, col, index) => {
    const next = { main: layout.main.filter((x) => x !== id), side: layout.side.filter((x) => x !== id) };
    const list = next[col];
    list.splice(index == null ? list.length : Math.min(index, list.length), 0, id);
    saveLayout(next);
  };
  const hide = (id) => saveLayout({ main: layout.main.filter((x) => x !== id), side: layout.side.filter((x) => x !== id) });
  const show = (id) => moveTo(id, HOME_CARDS[id].col);
  const reset = () => updateSettings({ home: null });

  const cards = {
    call: (
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
    ),
    pinned: (
      <section className="panel">
        <div className="panel-head">
          <h2>Pinned contacts</h2>
        </div>
        {pinnedPeople.length === 0 ? (
          <p className="muted">Pin the people you deal with most and they'll show here. Use <strong>Pin</strong> on someone's page, or <strong>Pin to Home</strong> in their ⋯ menu.</p>
        ) : (
          <ul className="call-list">
            {pinnedPeople.map(({ c, f }) => {
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
                    <button className="icon-btn" onClick={() => togglePin(c.id)} aria-label={`Unpin ${c.firstName} ${c.lastName}`} title="Unpin">
                      <Icon name="close" size={14} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    ),
    note: (
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
          <RichTextArea
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
          <SaveError message={noteError} />
        </form>
      </section>
    ),
    contracts: (
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
                      {p ? `${p.firstName} ${p.lastName}, ` : ''}{[k.location, k.value != null && money(k.value)].filter(Boolean).join(', ')}
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
    ),
    ending: (
      <section className="panel">
        <div className="panel-head">
          <h2>Contracts ending soon</h2>
          <button className="link-btn" onClick={() => onNavigate('contracts')}>All contracts</button>
        </div>
        {endingList.length === 0 ? (
          <p className="muted">No active contracts end in the next 60 days.</p>
        ) : (
          <ul className="contract-list">
            {endingList.map(({ k, daysLeft }) => {
              const p = contactsById[k.contactId];
              return (
                <li key={k.id}>
                  <button className="contract-item" onClick={() => onEditContract(k.id)}>
                    <div className="contract-title">{k.title}</div>
                    <div className="muted small">{p ? `${p.firstName} ${p.lastName}` : ''}{k.orgId && orgsById[k.orgId] ? `, ${orgsById[k.orgId].name}` : ''}</div>
                    <span className={'status-pill ' + (daysLeft <= 30 ? 'status-ending' : 'status-active')}>
                      {daysLeft <= 0 ? 'Ends today' : `Ends in ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'}`}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    ),
    week: (
      <section className="panel">
        <div className="panel-head">
          <h2>This week's check-ins</h2>
          <button className="link-btn" onClick={() => onNavigate('stats')}>Statistics</button>
        </div>
        <p className="week-total">
          <strong>{weekTotal}</strong> in the last 7 days
          <span className="muted small"> ({lastWeek} the week before)</span>
        </p>
        <div className="week-bars" role="img" aria-label={`Check-ins per day: ${week.map((x) => `${x.d.toLocaleDateString(undefined, { weekday: 'short' })} ${x.count}`).join(', ')}`}>
          {week.map((x, i) => (
            <div key={i} className="week-bar">
              <span className="week-count">{x.count || ''}</span>
              <span className="week-fill" style={{ height: `calc((100% - 40px) * ${x.count / weekMax})` }} />
              <span className="week-day">{x.d.toLocaleDateString(undefined, { weekday: 'narrow' })}</span>
            </div>
          ))}
        </div>
      </section>
    ),
    recent: (
      <section className="panel">
        <div className="panel-head">
          <h2>Recently added</h2>
          <button className="link-btn" onClick={() => onNavigate('contacts')}>All contacts</button>
        </div>
        {recent.length === 0 ? (
          <p className="muted">Nobody added in the last 30 days.</p>
        ) : (
          <ul className="people-list">
            {recent.map((c) => (
              <li key={c.id}>
                <button className="link-btn" onClick={() => onOpen(c.id)}>{c.firstName} {c.lastName}</button>
                <span className="muted small">{c.orgId ? orgsById[c.orgId]?.name : 'Independent'}, added {formatDate(c.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    ),
    latest: (
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
                <p className="note-text">{plainText(n.text)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    ),
  };

  // Drag and drop while customizing. Arrow buttons do the same from the keyboard.
  const dropOn = (col, index) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    const id = e.dataTransfer.getData('text/plain') || dragging;
    if (HOME_CARDS[id]) moveTo(id, col, index);
    setDragging(null);
  };
  const renderCol = (col) => (
    <div
      className={'home-col' + (customizing ? ' is-customizing' : '')}
      onDragOver={customizing ? (e) => e.preventDefault() : undefined}
      onDrop={customizing ? dropOn(col, null) : undefined}
    >
      {layout[col].map((id, i) => (
        <div
          key={id}
          className={'widget' + (dragging === id ? ' is-dragging' : '')}
          draggable={customizing}
          onDragStart={customizing ? (e) => { e.dataTransfer.setData('text/plain', id); e.dataTransfer.effectAllowed = 'move'; setDragging(id); } : undefined}
          onDragEnd={() => setDragging(null)}
          onDragOver={customizing ? (e) => e.preventDefault() : undefined}
          onDrop={customizing ? dropOn(col, i) : undefined}
        >
          {customizing && (
            <div className="widget-tools" role="group" aria-label={`Arrange ${HOME_CARDS[id].title}`}>
              <span className="widget-grip" aria-hidden="true"><Icon name="grip" size={16} /></span>
              <span className="widget-name">{HOME_CARDS[id].title}</span>
              <button className="icon-btn" onClick={() => move(id, -1)} disabled={i === 0} aria-label={`Move ${HOME_CARDS[id].title} up`}><Icon name="up" size={15} /></button>
              <button className="icon-btn" onClick={() => move(id, 1)} disabled={i === layout[col].length - 1} aria-label={`Move ${HOME_CARDS[id].title} down`}><Icon name="down" size={15} /></button>
              <button className="icon-btn" onClick={() => moveTo(id, col === 'main' ? 'side' : 'main')} aria-label={`Move ${HOME_CARDS[id].title} to the ${col === 'main' ? 'right' : 'left'} column`}>
                <Icon name={col === 'main' ? 'right' : 'left'} size={15} />
              </button>
              <button className="icon-btn" onClick={() => hide(id)} aria-label={`Hide ${HOME_CARDS[id].title}`} title="Hide"><Icon name="eyeOff" size={15} /></button>
            </div>
          )}
          <div className="widget-body" inert={customizing ? '' : undefined}>{cards[id]}</div>
        </div>
      ))}
      {customizing && layout[col].length === 0 && <p className="widget-empty">Drag a card here</p>}
    </div>
  );

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
        {customizing ? (
          <div className="btn-row">
            <button className="btn-primary" onClick={() => setCustomizing(false)}>Done</button>
            <button className="btn-ghost" onClick={reset}>Reset layout</button>
          </div>
        ) : (
          <button className="btn-ghost" onClick={() => setCustomizing(true)}>Customize</button>
        )}
      </header>

      {customizing && (
        <div className="customize-bar">
          <p>Drag cards to move them, or use the arrows. Hide what you don't need.</p>
          {hidden.length > 0 && (
            <div className="customize-add">
              <span className="muted small">Add a card:</span>
              {hidden.map((id) => (
                <button key={id} className="chip" onClick={() => show(id)}>
                  <Icon name="plus" size={13} /> {HOME_CARDS[id].title}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {layout.main.length + layout.side.length === 0 && !customizing ? (
        <div className="empty">
          <p>Your Home page has no cards.</p>
          <button className="btn-primary" onClick={() => setCustomizing(true)}>Customize</button>
        </div>
      ) : (
        <div className="home-grid">
          {renderCol('main')}
          {renderCol('side')}
        </div>
      )}
    </>
  );
}
