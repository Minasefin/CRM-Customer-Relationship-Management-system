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
import { api } from './api/index.js';
import { DataContext, ActionsContext } from './lib/dataContext.js';
import { SettingsContext, useSettingsState, useTheme, nextSwitch } from './hooks/useSettings.js';

const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]));

export default function App() {
  const settingsState = useSettingsState();
  const theme = useTheme(settingsState[0]);
  const [page, setPage] = useState('home');
  const [openId, setOpenId] = useState(null); // contact profile being viewed
  const [openOrgId, setOpenOrgId] = useState(null); // firm page being viewed (under any open profile)
  const [data, setData] = useState({ organizations: [], contacts: [], contracts: [], employment: [] });

  const load = useCallback(
    () =>
      Promise.all([api.getOrganizations(), api.getContacts(), api.getContracts(), api.getAllEmployment()]).then(
        ([organizations, contacts, contracts, employment]) => setData({ organizations, contacts, contracts, employment }),
      ),
    [],
  );

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
    archived: data.contacts.filter((c) => c.status !== 'active').length + data.organizations.filter((o) => o.archived).length,
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

  const addNote = async (contactId, text) => {
    await api.addNote(contactId, text);
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

  // One confirm box for archive / delete / status changes from the ⋯ menus.
  const [confirm, setConfirm] = useState(null);
  const ask = (opts) => setConfirm(opts);
  const done = async (fn) => {
    await fn();
    await load();
    setConfirm(null);
  };
  const money = (n) => (n || 0).toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
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
        : done(() => api.archiveOrganization(o.id, false)),
    deleteOrg: (o) =>
      ask({
        title: `Delete ${o.name}?`,
        message: "It has no people, history or contracts, so nothing else changes. This can't be undone.",
        confirmLabel: 'Delete organization',
        danger: true,
        onConfirm: () =>
          done(async () => {
            await api.deleteOrganization(o.id);
            if (openOrgId === o.id) setOpenOrgId(null);
          }),
      }),
    deleteContract: (k) =>
      ask({
        title: `Delete ${k.title} (${money(k.value)})?`,
        message: "This can't be undone.",
        confirmLabel: 'Delete contract',
        danger: true,
        onConfirm: () => done(() => api.deleteContract(k.id)),
      }),
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
  };
  const open = openId && contactsById[openId];
  const openOrgRecord = openOrgId && orgsById[openOrgId];

  return (
    <SettingsContext.Provider value={settingsState}>
      <DataContext.Provider value={data}>
      <ActionsContext.Provider value={actions}>
        <div className="app">
          <Sidebar page={page} onNavigate={navigate} counts={counts} theme={theme} onToggleTheme={toggleTheme} />
          <main className="main">
            {open ? (
              <ContactProfile
                contact={open}
                org={orgsById[open.orgId]}
                orgsById={orgsById}
                contracts={data.contracts}
                onBack={() => setOpenId(null)}
                onEdit={() => setForm({ kind: 'contact', id: open.id })}
                onAddNote={addNote}
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
                {page === 'settings' && <SettingsPage theme={theme} />}
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
            contract={form.id ? data.contracts.find((k) => k.id === form.id) : null}
            contactId={form.contactId}
            contacts={data.contacts}
            organizations={data.organizations}
            onSave={saveContract}
            onClose={() => setForm(null)}
          />
        )}
        {confirm && <ConfirmDialog {...confirm} onCancel={() => setConfirm(null)} />}
      </ActionsContext.Provider>
      </DataContext.Provider>
    </SettingsContext.Provider>
  );
}
