import ContactCard from '../components/ContactCard.jsx';
import Icon from '../components/Icon.jsx';
import { orgInitials } from '../components/formBits.jsx';
import { formatDate } from '../lib/freshness.js';

const money = (n) => n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export function RecentPage({ contacts, orgsById, onOpen }) {
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
          <ContactCard key={c.id} contact={c} org={orgsById[c.orgId]} onOpen={onOpen} />
        ))}
      </div>
    </>
  );
}

export function OrganizationsPage({ organizations, contacts, onAddOrg, onOpenOrg }) {
  const independent = contacts.filter((c) => !c.orgId && c.status === 'active').length;
  return (
    <>
      <header className="page-head">
        <div>
          <h1>Organizations</h1>
          <p className="page-sub">
            {organizations.length} firms in your contacts{independent > 0 && `, plus ${independent} independent ${independent === 1 ? 'contact' : 'contacts'}`}.
          </p>
        </div>
        <button className="btn-primary" onClick={onAddOrg}>
          <Icon name="plus" size={16} /> Add organization
        </button>
      </header>
      <div className="grid grid-wide">
        {organizations.map((o) => {
          const people = contacts.filter((c) => c.orgId === o.id && c.status === 'active');
          const place = [o.city, o.country].filter(Boolean).join(', ');
          return (
            <article
              key={o.id}
              className="org-card"
              tabIndex={0}
              role="button"
              aria-label={`Open ${o.name}`}
              onClick={() => onOpenOrg(o.id)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpenOrg(o.id))}
            >
              <div className="org-logo" aria-hidden="true">
                {o.logo ? <img src={o.logo} alt="" /> : orgInitials(o.name)}
              </div>
              <div>
                <h3>{o.name}</h3>
                <p className="muted">{place || 'No location yet'}</p>
                <p className="org-people">{people.length} active {people.length === 1 ? 'contact' : 'contacts'}</p>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}

export function ContractsPage({ contracts, contactsById, orgsById, onAddContract, onEditContract }) {
  const sorted = [...contracts].sort((a, b) => (a.status !== b.status ? (a.status === 'active' ? -1 : 1) : a.start < b.start ? 1 : -1));
  return (
    <>
      <header className="page-head">
        <div>
          <h1>Contracts</h1>
          <p className="page-sub">{contracts.filter((k) => k.status === 'active').length} active right now. Click a contract to edit it.</p>
        </div>
        <button className="btn-primary" onClick={() => onAddContract()}>
          <Icon name="plus" size={16} /> Add contract
        </button>
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
            {sorted.map((k) => {
              const p = contactsById[k.contactId];
              return (
                <tr
                  key={k.id}
                  className="row-click"
                  tabIndex={0}
                  onClick={() => onEditContract(k.id)}
                  onKeyDown={(e) => e.key === 'Enter' && onEditContract(k.id)}
                >
                  <td>{k.title}<div className="muted small">{k.orgId ? orgsById[k.orgId]?.name : 'Independent'}</div></td>
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

export function ArchivedPage({ contacts, orgsById, onOpen }) {
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
          <ContactCard key={c.id} contact={c} org={orgsById[c.orgId]} onOpen={onOpen} />
        ))}
      </div>
    </>
  );
}
