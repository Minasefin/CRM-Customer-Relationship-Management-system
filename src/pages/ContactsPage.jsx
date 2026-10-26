import { useMemo, useState } from 'react';
import ContactCard from '../components/ContactCard.jsx';
import Icon from '../components/Icon.jsx';
import { freshness } from '../lib/freshness.js';
import { useSettings } from '../hooks/useSettings.js';
import SortSelect, { useSort } from '../components/SortSelect.jsx';
import { contactSorts } from '../lib/sorting.js';

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
  const shown = active
    .filter((c) => {
      if (filter === 'all') return true;
      const l = freshness(c, settings).level;
      return filter === 'overdue' ? l === 'overdue' || l === 'never' : l === filter;
    })
    .filter((c) => {
      if (!q) return true;
      const hay = [c.firstName, c.lastName, c.title, c.orgId ? orgsById[c.orgId]?.name : 'Independent', ...c.skills].join(' ').toLowerCase();
      return hay.includes(q);
    })
    .sort(contactSorts.find((o) => o.id === sort).fn);

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

      {shown.length === 0 ? (
        <div className="empty">
          <p>{query ? `No contacts match “${query}”.` : 'Nobody in this group right now.'}</p>
          <button className="btn-ghost" onClick={() => { setQuery(''); setFilter('all'); }}>Clear search</button>
        </div>
      ) : (
        <div className="grid">
          {shown.map((c) => (
            <ContactCard key={c.id} contact={c} org={orgsById[c.orgId]} onOpen={onOpen} />
          ))}
        </div>
      )}
    </>
  );
}
