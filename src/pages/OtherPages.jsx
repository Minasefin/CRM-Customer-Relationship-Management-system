import ContactCard from '../components/ContactCard.jsx';
import { formatDate } from '../lib/freshness.js';

const money = (n) => n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export function RecentPage({ contacts, orgsById }) {
  const recent = [...contacts]
    .filter((c) => c.status === 'active')
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 8);
  return (
    <>
      <header className="page-head">
        <div>
          <h1>Recently added</h1>
          <p className="page-sub">The newest people in your contacts, newest first.</p>
        </div>
      </header>
      <div className="grid">
        {recent.map((c) => (
          <ContactCard key={c.id} contact={c} org={orgsById[c.orgId]} />
        ))}
      </div>
    </>
  );
}

export function OrganizationsPage({ organizations, contacts }) {
  return (
    <>
      <header className="page-head">
        <div>
          <h1>Organizations</h1>
          <p className="page-sub">{organizations.length} firms in your contacts.</p>
        </div>
      </header>
      <div className="grid grid-wide">
        {organizations.map((o) => {
          const people = contacts.filter((c) => c.orgId === o.id && c.status === 'active');
          return (
            <article key={o.id} className="org-card" tabIndex={0}>
              <div className="org-logo" aria-hidden="true">{o.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}</div>
              <div>
                <h3>{o.name}</h3>
                <p className="muted">{o.city}, {o.country}</p>
                <p className="org-people">{people.length} active {people.length === 1 ? 'contact' : 'contacts'}</p>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}

export function ContractsPage({ contracts, contactsById, orgsById }) {
  return (
    <>
      <header className="page-head">
        <div>
          <h1>Contracts</h1>
          <p className="page-sub">{contracts.filter((k) => k.status === 'active').length} active right now.</p>
        </div>
      </header>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Contract</th>
              <th>Contractor</th>
              <th>Location</th>
              <th className="num">Value</th>
              <th>Started</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {contracts.map((k) => {
              const p = contactsById[k.contactId];
              return (
                <tr key={k.id}>
                  <td>{k.title}<div className="muted small">{orgsById[k.orgId]?.name}</div></td>
                  <td>{p ? `${p.firstName} ${p.lastName}` : '—'}</td>
                  <td>{k.location}</td>
                  <td className="num">{money(k.value)}</td>
                  <td>{formatDate(k.start)}</td>
                  <td><span className={`status-pill status-${k.status}`}>{k.status === 'active' ? 'On contract' : 'Completed'}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function ArchivedPage({ contacts, orgsById }) {
  const archived = contacts.filter((c) => c.status !== 'active');
  return (
    <>
      <header className="page-head">
        <div>
          <h1>Archived</h1>
          <p className="page-sub">People who left their organization or have died. Records are kept, never deleted.</p>
        </div>
      </header>
      <div className="grid">
        {archived.map((c) => (
          <ContactCard key={c.id} contact={c} org={orgsById[c.orgId]} />
        ))}
      </div>
    </>
  );
}
