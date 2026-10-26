import { useCallback, useEffect, useMemo, useState } from 'react';
import Sidebar from './components/Sidebar.jsx';
import ContactsPage from './pages/ContactsPage.jsx';
import ContactProfile from './pages/ContactProfile.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import { RecentPage, OrganizationsPage, ContractsPage, ArchivedPage } from './pages/OtherPages.jsx';
import { api } from './api/index.js';
import { SettingsContext, useSettingsState, useTheme } from './hooks/useSettings.js';

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

  const props = { ...data, orgsById, contactsById, onOpen: setOpenId };
  const open = openId && contactsById[openId];

  return (
    <SettingsContext.Provider value={settingsState}>
      <div className="app">
        <Sidebar page={page} onNavigate={navigate} counts={counts} theme={theme} />
        <main className="main">
          {open ? (
            <ContactProfile
              contact={open}
              org={orgsById[open.orgId]}
              contracts={data.contracts}
              onBack={() => setOpenId(null)}
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
    </SettingsContext.Provider>
  );
}
