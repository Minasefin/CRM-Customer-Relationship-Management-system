import ContactCard from '../components/ContactCard.jsx';
import Icon from '../components/Icon.jsx';
import MoreMenu from '../components/MoreMenu.jsx';
import SortSelect, { useSort } from '../components/SortSelect.jsx';
import { orgInitials } from '../components/formBits.jsx';
import { formatDate } from '../lib/freshness.js';
import { orgSorts, contractSorts } from '../lib/sorting.js';
import { useActions } from '../lib/dataContext.js';
import { money } from '../lib/money.js';


// Same ⋯ menu for a firm wherever it shows up. Nothing is ever deleted: archive hides, restore brings back.
export function orgMenu(org, _data, actions) {
  return [
    { label: 'Edit', onSelect: () => actions.editOrg(org.id) },
    org.archived
      ? { label: 'Restore', onSelect: () => actions.archiveOrg(org, false) }
      : { label: 'Archive', onSelect: () => actions.archiveOrg(org, true) },
  ];
}

// Same ⋯ menu for a contract wherever it shows up.
export function contractMenu(k, actions, onEditContract) {
  return k.archived
    ? [{ label: 'Restore', onSelect: () => actions.archiveContract(k, false) }]
    : [
        { label: 'Edit', onSelect: () => onEditContract(k.id) },
        { label: 'Archive', onSelect: () => actions.archiveContract(k, true) },
      ];
}

function OrgCard({ org, data, onOpenOrg }) {
  const actions = useActions();
  const people = data.contacts.filter((c) => c.orgId === org.id && c.status === 'active');
  const place = [org.city, org.country].filter(Boolean).join(', ');
  return (
    <article
      className={'org-card' + (org.archived ? ' is-archived' : '')}
      tabIndex={0}
      role="button"
      aria-label={`Open ${org.name}`}
      onClick={() => onOpenOrg(org.id)}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpenOrg(org.id))}
    >
      <div className="org-logo" aria-hidden="true">
        {org.logo ? <img src={org.logo} alt="" /> : orgInitials(org.name)}
      </div>
      <div className="org-card-body">
        <h3>{org.name}</h3>
        <p className="muted">{place || 'No location yet'}</p>
        <p className="org-people">{people.length} active {people.length === 1 ? 'contact' : 'contacts'}</p>
      </div>
      <MoreMenu items={orgMenu(org, data, actions)} label={`Actions for ${org.name}`} />
    </article>
  );
}

export function OrganizationsPage({ organizations, contacts, contracts, employment, onAddOrg, onOpenOrg }) {
  const [sort, setSort] = useSort('orgs', orgSorts);
  const data = { contacts, contracts, employment };
  const live = organizations.filter((o) => !o.archived);
  const shown = [...live].sort(orgSorts.find((o) => o.id === sort).fn(data));
  const independent = contacts.filter((c) => !c.orgId && c.status === 'active').length;
  const archivedCount = organizations.length - live.length;

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Organizations</h1>
          <p className="page-sub">
            {live.length} firms in your contacts
            {independent > 0 && `, plus ${independent} independent ${independent === 1 ? 'contact' : 'contacts'}`}.
            {archivedCount > 0 && ` ${archivedCount} archived.`}
          </p>
        </div>
        <button className="btn-primary" onClick={onAddOrg}>
          <Icon name="plus" size={16} /> Add organization
        </button>
      </header>
      <div className="toolbar toolbar-end">
        <SortSelect value={sort} onChange={setSort} options={orgSorts} />
      </div>
      <div className="grid grid-wide">
        {shown.map((o) => <OrgCard key={o.id} org={o} data={data} onOpenOrg={onOpenOrg} />)}
      </div>
    </>
  );
}

export function ContractsPage({ contracts, contactsById, orgsById, onAddContract, onEditContract }) {
  const actions = useActions();
  const [sort, setSort] = useSort('contracts', contractSorts);
  const sorted = [...contracts].sort(contractSorts.find((o) => o.id === sort).fn);
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
      <div className="toolbar toolbar-end">
        <SortSelect value={sort} onChange={setSort} options={contractSorts} />
      </div>
      {sorted.length === 0 ? (
        <div className="empty">
          <p>No contracts yet.</p>
          <button className="btn-primary" onClick={() => onAddContract()}>Add contract</button>
        </div>
      ) : (
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
                <th><span className="sr-only">Actions</span></th>
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
                    <td>
                      {k.title}
                      <div className="muted small">{k.orgId ? orgsById[k.orgId]?.name : 'Independent'}</div>
                      {k.notes && <div className="contract-notes clamp">{k.notes}</div>}
                    </td>
                    <td>{p ? `${p.firstName} ${p.lastName}` : '—'}</td>
                    <td>{k.location}</td>
                    <td className="num">{money(k.value)}</td>
                    <td>{formatDate(k.start)}</td>
                    <td><span className={`status-pill status-${k.status}`}>{k.status === 'active' ? 'On contract' : 'Completed'}</span></td>
                    <td className="cell-menu">
                      <MoreMenu
                        label={`Actions for ${k.title}`}
                        items={contractMenu(k, actions, onEditContract)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export function ArchivedPage({ contacts, organizations, contracts, employment, archivedContracts = [], contactsById, orgsById, onOpen, onOpenOrg }) {
  const actions = useActions();
  const archived = contacts.filter((c) => c.status !== 'active');
  const archivedOrgs = organizations.filter((o) => o.archived);
  const data = { contacts, contracts, employment };
  return (
    <>
      <header className="page-head">
        <div>
          <h1>Archived</h1>
          <p className="page-sub">People who left or have died, and organizations and contracts you archived. Nothing here is deleted.</p>
        </div>
      </header>

      <section className="org-section first">
        <h2>People</h2>
        {archived.length === 0 ? (
          <p className="muted">No archived people.</p>
        ) : (
          <div className="grid">
            {archived.map((c) => <ContactCard key={c.id} contact={c} org={orgsById[c.orgId]} onOpen={onOpen} />)}
          </div>
        )}
      </section>

      <section className="org-section">
        <h2>Organizations</h2>
        {archivedOrgs.length === 0 ? (
          <p className="muted">No archived organizations. Use Archive in a firm's ⋯ menu to hide it from your lists.</p>
        ) : (
          <div className="grid grid-wide">
            {archivedOrgs.map((o) => <OrgCard key={o.id} org={o} data={data} onOpenOrg={onOpenOrg} />)}
          </div>
        )}
      </section>

      <section className="org-section">
        <h2>Contracts</h2>
        {archivedContracts.length === 0 ? (
          <p className="muted">No archived contracts. Use Archive in a contract's ⋯ menu to hide it.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Contract</th>
                  <th>Contractor</th>
                  <th className="num">Value</th>
                  <th>Status</th>
                  <th><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {archivedContracts.map((k) => {
                  const p = contactsById[k.contactId];
                  return (
                    <tr key={k.id}>
                      <td>{k.title}<div className="muted small">{k.orgId ? orgsById[k.orgId]?.name : 'Independent'}</div></td>
                      <td>{p ? `${p.firstName} ${p.lastName}` : '—'}</td>
                      <td className="num">{money(k.value)}</td>
                      <td><span className={`status-pill status-${k.status}`}>{k.status === 'active' ? 'On contract' : 'Completed'}</span></td>
                      <td className="cell-menu">
                        <MoreMenu label={`Actions for ${k.title}`} items={contractMenu(k, actions)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
