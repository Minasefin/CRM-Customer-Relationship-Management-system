import { useCallback, useEffect, useMemo, useState } from 'react';
import Sidebar from './components/Sidebar.jsx';
import ContactsPage from './pages/ContactsPage.jsx';
import ContactProfile from './pages/ContactProfile.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import ContactForm from './components/ContactForm.jsx';
import OrgForm from './components/OrgForm.jsx';
import { RecentPage, OrganizationsPage, ContractsPage, ArchivedPage } from './pages/OtherPages.jsx';
import { api } from './api/index.js';
import { SettingsContext, useSettingsState, useTheme, nextSwitch } from './hooks/useSettings.js';

const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]));

export default function App() {
  const settingsState = useSettingsState();
  const theme = useTheme(settingsState[0]);
  const [page, setPage] = useState('contacts');
  const [openId, setOpenId] = useState(null); // contact profile being viewed
  const [data, setData] = useState({ organizations: [], contacts: [], contracts: [] });

  const load = useCallback(
    () =>
      Promise.all([api.getOrganizations(), api.getContacts(), api.getContracts()]).then(
        ([organizations, contacts, contracts]) => setData({ organizations, contacts, contracts }),
      ),
    [],
  );

  useEffect(() => {
    load();
  }, [load]);

  // Start each page and profile at the top.
  useEffect(() => {
    document.querySelector('.main')?.scrollTo(0, 0);
  }, [openId, page]);

  const orgsById = useMemo(() => byId(data.organizations), [data.organizations]);
  const contactsById = useMemo(() => byId(data.contacts), [data.contacts]);

  const counts = {
    contacts: data.contacts.filter((c) => c.status === 'active').length,
    orgs: data.organizations.length,
    contracts: data.contracts.filter((k) => k.status === 'active').length,
    archived: data.contacts.filter((c) => c.status !== 'active').length,
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
    setPage(p);
  };

  const addNote = async (contactId, text) => {
    await api.addNote(contactId, text);
    await load();
  };

  const setStatus = async (id, status) => {
    await api.setContactStatus(id, status);
    await load();
  };

  // Which form panel is open: { kind: 'contact' | 'org', id: string | null } (null id = adding new)
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

  const props = {
    ...data,
    orgsById,
    contactsById,
    onOpen: setOpenId,
    onAdd: () => setForm({ kind: 'contact', id: null }),
    onAddOrg: () => setForm({ kind: 'org', id: null }),
    onEditOrg: (id) => setForm({ kind: 'org', id }),
  };
  const open = openId && contactsById[openId];

  return (
    <SettingsContext.Provider value={settingsState}>
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
            />
          ) : (
            <>
              {page === 'contacts' && <ContactsPage {...props} />}
              {page === 'recent' && <RecentPage {...props} />}
              {page === 'orgs' && <OrganizationsPage {...props} />}
              {page === 'contracts' && <ContractsPage {...props} />}
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
    </SettingsContext.Provider>
  );
}
