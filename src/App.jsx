import { useCallback, useEffect, useMemo, useState } from 'react';
import Sidebar from './components/Sidebar.jsx';
import ContactsPage from './pages/ContactsPage.jsx';
import ContactProfile from './pages/ContactProfile.jsx';
import OrgPage from './pages/OrgPage.jsx';
import StatsPage from './pages/StatsPage.jsx';
import HomePage from './pages/HomePage.jsx';
import ConfirmDialog from './components/ConfirmDialog.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import ContactForm from './components/ContactForm.jsx';
import OrgForm from './components/OrgForm.jsx';
import ContractForm from './components/ContractForm.jsx';
import { OrganizationsPage, ContractsPage, ArchivedPage } from './pages/OtherPages.jsx';
import { api, dataMode, dataError } from './api/index.js';
import { DataContext, ActionsContext } from './lib/dataContext.js';
import { SettingsContext, useSettingsState, useTheme, nextSwitch } from './hooks/useSettings.js';

const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]));

export default function App({ exploring = false, canLock = false }) {
  const settingsState = useSettingsState();
  const theme = useTheme(settingsState[0]);
  const [page, setPage] = useState('home');
  const [openId, setOpenId] = useState(null); // contact profile being viewed
  const [openOrgId, setOpenOrgId] = useState(null); // firm page being viewed (under any open profile)
  const [all, setAll] = useState({ organizations: [], contacts: [], contracts: [], employment: [] });
  const [loadError, setLoadError] = useState('');
  const [toast, setToast] = useState('');
  const errorText = (e) => (e && (e.userMessage || e.message)) || 'Something went wrong. Try again.';

  const load = useCallback(
    () =>
      Promise.all([api.getOrganizations(), api.getContacts(), api.getContracts(), api.getAllEmployment()])
        .then(([organizations, contacts, contracts, employment]) => {
          setAll({ organizations, contacts, contracts, employment });
          setLoadError('');
        })
        .catch((e) => setLoadError(errorText(e))),
    [],
  );

  // Archived contracts stay in the database but are left out of every normal view;
  // only the Archived page shows them.
  const data = useMemo(
    () => ({ ...all, contracts: all.contracts.filter((k) => !k.archived) }),
    [all],
  );
  const archivedContracts = useMemo(() => all.contracts.filter((k) => k.archived), [all]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  // Start each page and profile at the top.
  useEffect(() => {
    document.querySelector('.main')?.scrollTo(0, 0);
  }, [openId, openOrgId, page]);

  const orgsById = useMemo(() => byId(data.organizations), [data.organizations]);
  const contactsById = useMemo(() => byId(data.contacts), [data.contacts]);

  const counts = {
    contacts: data.contacts.filter((c) => c.status === 'active').length,
    orgs: data.organizations.filter((o) => !o.archived).length,
    contracts: data.contracts.filter((k) => k.status === 'active').length,
    archived:
      data.contacts.filter((c) => c.status !== 'active').length +
      data.organizations.filter((o) => o.archived).length +
      archivedContracts.length,
  };

  // Sidebar light/dark click. With the time-of-day switch on, it holds until the next
  // scheduled switch and then the schedule takes over. With it off, it just flips the mode.
  const toggleTheme = () => {
    const [s, update] = settingsState;
    const other = theme === 'dark' ? 'light' : 'dark';
    if (s.autoTheme) update({ override: { theme: other, until: nextSwitch(s.lightFrom, s.darkFrom) } });
    else update({ manualTheme: other });
  };

  const navigate = (p) => {
    setOpenId(null);
    setOpenOrgId(null);
    setPage(p);
  };

  const openOrg = (id) => {
    setOpenId(null);
    setOpenOrgId(id);
    setPage('orgs');
  };

  // These throw on failure so the screen that called them can show the reason.
  const addNote = async (contactId, text) => {
    await api.addNote(contactId, text);
    await load();
  };

  const updateNote = async (noteId, text) => {
    await api.updateNote(noteId, text);
    await load();
  };

  const setStatus = async (id, status) => {
    await api.setContactStatus(id, status);
    await load();
  };

  // Which form panel is open: { kind: 'contact' | 'org' | 'contract', id, contactId? } (null id = adding new)
  const [form, setForm] = useState(null);

  const saveContact = async (values, { moved }) => {
    if (form.id) {
      await api.updateContact(form.id, values);
      if (moved) await api.moveContact(form.id, values.orgId);
    } else {
      const created = await api.createContact(values);
      setOpenId(created.id);
    }
    await load();
  };

  const createOrg = async (values) => {
    const org = await api.createOrganization(values);
    await load();
    return org;
  };

  const saveOrg = async (values) => {
    if (form.id) await api.updateOrganization(form.id, values);
    else await api.createOrganization(values);
    await load();
  };

  const saveContract = async (values) => {
    if (form.id) await api.updateContract(form.id, values);
    else await api.createContract(values);
    await load();
  };

  // One confirm box for archive / restore / status changes from the ⋯ menus.
  const [confirm, setConfirm] = useState(null);
  const ask = (opts) => setConfirm(opts);
  const done = async (fn) => {
    await fn();
    await load();
    setConfirm(null);
  };
  // Restores happen without a confirm box, so show any failure as a message instead.
  const quietly = (fn) => done(fn).catch((e) => setToast(errorText(e)));
  const statusWords = { active: 'active', inactive: 'left / inactive', deceased: 'deceased' };

  const actions = {
    editContact: (id) => setForm({ kind: 'contact', id }),
    setContactStatus: (c, status) =>
      ask({
        title: `Mark ${c.firstName} ${c.lastName} as ${statusWords[status]}?`,
        message: status === 'active' ? 'They move back to your contacts.' : 'They move to Archived. Nothing is deleted.',
        confirmLabel: `Yes, mark ${statusWords[status]}`,
        onConfirm: () => done(() => api.setContactStatus(c.id, status)),
      }),
    editOrg: (id) => setForm({ kind: 'org', id }),
    archiveOrg: (o, archived) =>
      archived
        ? ask({
            title: `Archive ${o.name}?`,
            message: 'It will be hidden from your organization list. Its people, work history and contracts are kept, and you can restore it from Archived.',
            confirmLabel: 'Archive',
            onConfirm: () => done(() => api.archiveOrganization(o.id, true)),
          })
        : quietly(() => api.archiveOrganization(o.id, false)),
    archiveContract: (k, archived) =>
      archived
        ? ask({
            title: `Archive ${k.title}?`,
            message: "It will be hidden from contracts and stats. Nothing is deleted, and you can restore it from Archived.",
            confirmLabel: 'Archive contract',
            onConfirm: () => done(() => api.archiveContract(k.id, true)),
          })
        : quietly(() => api.archiveContract(k.id, false)),
  };

  const editContract = (id) => setForm({ kind: 'contract', id });
  const addContract = (contactId = null) => setForm({ kind: 'contract', id: null, contactId });

  const props = {
    ...data,
    orgsById,
    contactsById,
    onOpen: setOpenId,
    onAdd: () => setForm({ kind: 'contact', id: null }),
    onAddOrg: () => setForm({ kind: 'org', id: null }),
    onOpenOrg: openOrg,
    onAddContract: addContract,
    onEditContract: editContract,
    onNavigate: navigate,
    onAddNote: addNote,
    archivedContracts,
  };
  const open = openId && contactsById[openId];
  const openOrgRecord = openOrgId && orgsById[openOrgId];

  return (
    <SettingsContext.Provider value={settingsState}>
      <DataContext.Provider value={data}>
      <ActionsContext.Provider value={actions}>
        <div className="app">
          <Sidebar page={page} onNavigate={navigate} counts={counts} theme={theme} onToggleTheme={toggleTheme} dataMode={dataMode} canLock={canLock} />
          <main className="main">
            {exploring && (
              <p className="banner banner-warn" role="status">
                <strong>You're looking at sample data.</strong> Nothing you add here is saved.{' '}
                <button className="link-btn" onClick={() => window.location.reload()}>Sign in to your data</button>
              </p>
            )}
            {dataError && (
              <p className="banner banner-warn" role="alert">
                <strong>The test database didn't open.</strong> {dataError} You're seeing sample data, and changes won't be saved.
              </p>
            )}
            {loadError && (
              <p className="banner banner-error" role="alert">
                <strong>Couldn't load your data.</strong> {loadError}{' '}
                <button className="link-btn" onClick={load}>Try again</button>
              </p>
            )}
            {open ? (
              <ContactProfile
                contact={open}
                org={orgsById[open.orgId]}
                orgsById={orgsById}
                contracts={data.contracts}
                onBack={() => setOpenId(null)}
                onEdit={() => setForm({ kind: 'contact', id: open.id })}
                onAddNote={addNote}
                onUpdateNote={updateNote}
                onSetStatus={setStatus}
                onAddContract={addContract}
                onEditContract={editContract}
                onOpenOrg={openOrg}
              />
            ) : openOrgRecord ? (
              <OrgPage
                {...props}
                org={openOrgRecord}
                onBack={() => setOpenOrgId(null)}
                onEdit={() => setForm({ kind: 'org', id: openOrgRecord.id })}
              />
            ) : (
              <>
                {page === 'home' && <HomePage {...props} />}
                {page === 'contacts' && <ContactsPage {...props} />}
                {page === 'orgs' && <OrganizationsPage {...props} />}
                {page === 'contracts' && <ContractsPage {...props} />}
                {page === 'stats' && <StatsPage {...props} />}
                {page === 'archived' && <ArchivedPage {...props} />}
                {page === 'settings' && <SettingsPage theme={theme} canLock={canLock} />}
              </>
            )}
          </main>
        </div>

        {form?.kind === 'contact' && (
          <ContactForm
            key={form.id || 'new'}
            contact={form.id ? contactsById[form.id] : null}
            organizations={data.organizations}
            contacts={data.contacts}
            onSave={saveContact}
            onCreateOrg={createOrg}
            onOpenExisting={(id) => {
              setForm(null);
              setOpenId(id);
            }}
            onClose={() => setForm(null)}
          />
        )}
        {form?.kind === 'org' && (
          <OrgForm
            key={form.id || 'new-org'}
            org={form.id ? orgsById[form.id] : null}
            organizations={data.organizations}
            onSave={saveOrg}
            onClose={() => setForm(null)}
          />
        )}
        {form?.kind === 'contract' && (
          <ContractForm
            key={form.id || 'new-contract'}
            contract={form.id ? all.contracts.find((k) => k.id === form.id) : null}
            contactId={form.contactId}
            contacts={data.contacts}
            organizations={data.organizations}
            onSave={saveContract}
            onClose={() => setForm(null)}
          />
        )}
        {confirm && <ConfirmDialog {...confirm} onCancel={() => setConfirm(null)} />}
        {toast && (
          <div className="toast" role="alert">
            {toast}
            <button className="icon-btn" aria-label="Dismiss" onClick={() => setToast('')}>✕</button>
          </div>
        )}
      </ActionsContext.Provider>
      </DataContext.Provider>
    </SettingsContext.Provider>
  );
}
