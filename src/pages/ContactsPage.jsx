import { useMemo, useState } from 'react';
import ContactCard from '../components/ContactCard.jsx';
import Icon from '../components/Icon.jsx';
import { freshness } from '../lib/freshness.js';
import { useSettings } from '../hooks/useSettings.js';
import SortSelect, { useSort } from '../components/SortSelect.jsx';
import { contactSorts } from '../lib/sorting.js';
import { soundsLike } from '../lib/soundex.js';

const filters = [
  { id: 'all', label: 'Everyone' },
  { id: 'fresh', label: 'Recently contacted' },
  { id: 'stale', label: 'Getting stale' },
  { id: 'overdue', label: 'Overdue' },
];

export default function ContactsPage({ contacts, orgsById, onOpen, onAdd }) {
  const [settings] = useSettings();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useSort('contacts', contactSorts);

  const active = contacts.filter((c) => c.status === 'active');

  const counts = useMemo(() => {
    const out = { all: active.length, fresh: 0, stale: 0, overdue: 0 };
    active.forEach((c) => {
      const l = freshness(c, settings).level;
      if (l === 'never' || l === 'overdue') out.overdue++;
      else out[l]++;
    });
    return out;
  }, [active, settings]);

  const q = query.trim().toLowerCase();
  const sorter = contactSorts.find((o) => o.id === sort).fn;
  const inFilter = active.filter((c) => {
    if (filter === 'all') return true;
    const l = freshness(c, settings).level;
    return filter === 'overdue' ? l === 'overdue' || l === 'never' : l === filter;
  });
  const exact = (c) => {
    const hay = [c.firstName, c.lastName, c.title, c.orgId ? orgsById[c.orgId]?.name : 'Independent', ...c.skills].join(' ').toLowerCase();
    return hay.includes(q);
  };
  // Soundex: names that sound like what was typed ("Smyth" finds "Smith").
  // Every typed word has to sound like the person's first or last name.
  const words = q.split(/\s+/).filter((w) => /[a-z]/.test(w));
  const soundAlike = (c) => words.length > 0 && words.every((w) => soundsLike(w, c.firstName) || soundsLike(w, c.lastName));

  const shown = inFilter.filter((c) => !q || exact(c)).sort(sorter);
  const alike = q ? inFilter.filter((c) => !exact(c) && soundAlike(c)).sort(sorter) : [];

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Contacts</h1>
          <p className="page-sub">{counts.overdue} people are overdue for a check-in.</p>
        </div>
        <button className="btn-primary" onClick={onAdd}>
          <Icon name="plus" size={16} /> Add contact
        </button>
      </header>

      <div className="toolbar">
        <label className="search">
          <Icon name="search" size={16} />
          <input
            type="search"
            placeholder="Search by name, organization or skill"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="chips" role="group" aria-label="Filter by last contact">
          {filters.map((f) => (
            <button
              key={f.id}
              className={'chip' + (filter === f.id ? ' is-on' : '') + ` chip-${f.id}`}
              onClick={() => setFilter(f.id)}
              aria-pressed={filter === f.id}
            >
              {f.label} <span className="chip-count">{counts[f.id]}</span>
            </button>
          ))}
        </div>
        <SortSelect value={sort} onChange={setSort} options={contactSorts} />
      </div>

      {shown.length === 0 && alike.length === 0 ? (
        <div className="empty">
          <p>{query ? `No contacts match “${query}”, and no names sound like it.` : 'Nobody in this group right now.'}</p>
          <button className="btn-ghost" onClick={() => { setQuery(''); setFilter('all'); }}>Clear search</button>
        </div>
      ) : (
        <>
          {shown.length > 0 && (
            <div className="grid">
              {shown.map((c) => (
                <ContactCard key={c.id} contact={c} org={orgsById[c.orgId]} onOpen={onOpen} />
              ))}
            </div>
          )}
          {alike.length > 0 && (
            <section className={'sounds-like' + (shown.length === 0 ? ' is-only' : '')}>
              <h2>{shown.length === 0 ? `No exact matches. These names sound like “${query.trim()}”` : `Names that sound like “${query.trim()}”`}</h2>
              <p className="muted small">Found by how the name sounds, in case it was spelled differently.</p>
              <div className="grid">
                {alike.map((c) => (
                  <ContactCard key={c.id} contact={c} org={orgsById[c.orgId]} onOpen={onOpen} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </>
  );
}
