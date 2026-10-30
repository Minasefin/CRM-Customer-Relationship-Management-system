import ContactCard from '../components/ContactCard.jsx';
import Icon from '../components/Icon.jsx';
import { orgInitials } from '../components/formBits.jsx';
import { formatDate } from '../lib/freshness.js';
import MoreMenu from '../components/MoreMenu.jsx';
import { orgMenu } from './OtherPages.jsx';
import { useActions } from '../lib/dataContext.js';
import { money } from '../lib/money.js';


// Everyone at one firm: current people, people who used to work there, and its contracts.
export default function OrgPage({ org, contacts, contactsById, contracts, employment, onBack, onEdit, onOpen, onEditContract }) {
  const actions = useActions();
  if (!org) return null;
  const place = [org.city, org.country].filter(Boolean).join(', ');
  const current = contacts.filter((c) => c.orgId === org.id && c.status === 'active');
  const archivedHere = contacts.filter((c) => c.orgId === org.id && c.status !== 'active');

  // Former people: a finished job here, and they're not currently here.
  const formerJobs = employment
    .filter((e) => e.orgId === org.id && e.end && contactsById[e.contactId]?.orgId !== org.id)
    .sort((a, b) => (a.end < b.end ? 1 : -1));
  const seen = new Set();
  const former = formerJobs.filter((e) => !seen.has(e.contactId) && seen.add(e.contactId));

  const theirContracts = contracts.filter((k) => k.orgId === org.id);

  return (
    <div className="profile">
      <button className="back" onClick={onBack}>
        <Icon name="back" size={16} /> Organizations
      </button>

      <header className="profile-head">
        <div className="org-logo org-logo-lg" aria-hidden="true">
          {org.logo ? <img src={org.logo} alt="" /> : orgInitials(org.name)}
        </div>
        <div className="profile-id">
          <h1>{org.name}</h1>
          <p className="profile-role">{place || 'No location yet'}</p>
          <p className="muted small">
            {current.length} active {current.length === 1 ? 'contact' : 'contacts'}
            {former.length + archivedHere.length > 0 && `, ${former.length + archivedHere.length} who used to work here`}
          </p>
        </div>
        <div className="quick-actions">
          <button className="btn-ghost" onClick={onEdit}><Icon name="edit" size={15} /> Edit</button>
          <MoreMenu items={orgMenu(org, { contacts, contracts, employment }, actions)} label={`Actions for ${org.name}`} />
        </div>
      </header>
      {org.archived && (
        <p className="warn">
          {org.name} is archived, so it's hidden from your organization list. Its history is kept.{' '}
          <button className="link-btn" onClick={() => actions.archiveOrg(org, false)}>Restore it</button>
        </p>
      )}

      <section className="org-section">
        <h2>People here now</h2>
        {current.length === 0 ? (
          <p className="muted">Nobody active at {org.name} right now.</p>
        ) : (
          <div className="grid">
            {current.map((c) => <ContactCard key={c.id} contact={c} org={org} onOpen={onOpen} />)}
          </div>
        )}
      </section>

      {(former.length > 0 || archivedHere.length > 0) && (
        <section className="org-section">
          <h2>Used to work here</h2>
          <div className="panel">
            <ul className="people-list">
              {former.map((e) => {
                const p = contactsById[e.contactId];
                if (!p) return null;
                return (
                  <li key={e.id}>
                    <button className="link-btn" onClick={() => onOpen(p.id)}>{p.firstName} {p.lastName}</button>
                    <span className="muted small">Left {formatDate(e.end)}</span>
                  </li>
                );
              })}
              {archivedHere.map((p) => (
                <li key={p.id}>
                  <button className="link-btn" onClick={() => onOpen(p.id)}>{p.firstName} {p.lastName}</button>
                  <span className="muted small">{p.status === 'deceased' ? 'Deceased' : 'Left / inactive'}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section className="org-section">
        <h2>Contracts</h2>
        {theirContracts.length === 0 ? (
          <p className="muted">No contracts with {org.name} yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Contract</th>
                  <th>Contractor</th>
                  <th>Location</th>
                  <th className="num">Value</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {theirContracts.map((k) => {
                  const p = contactsById[k.contactId];
                  return (
                    <tr key={k.id} className="row-click" tabIndex={0} onClick={() => onEditContract(k.id)} onKeyDown={(e) => e.key === 'Enter' && onEditContract(k.id)}>
                      <td>{k.title}</td>
                      <td>{p ? `${p.firstName} ${p.lastName}` : '—'}</td>
                      <td>{k.location}</td>
                      <td className="num">{money(k.value)}</td>
                      <td><span className={`status-pill status-${k.status}`}>{k.status === 'active' ? 'On contract' : 'Completed'}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
