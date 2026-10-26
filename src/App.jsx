import { useEffect, useMemo, useState } from 'react';
import Sidebar from './components/Sidebar.jsx';
import ContactsPage from './pages/ContactsPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import { RecentPage, OrganizationsPage, ContractsPage, ArchivedPage } from './pages/OtherPages.jsx';
import { api } from './api/index.js';
import { SettingsContext, useSettingsState, useTheme } from './hooks/useSettings.js';

const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]));

export default function App() {
  const settingsState = useSettingsState();
  const theme = useTheme(settingsState[0]);
  const [page, setPage] = useState('contacts');
  const [data, setData] = useState({ organizations: [], contacts: [], contracts: [] });

  useEffect(() => {
    Promise.all([api.getOrganizations(), api.getContacts(), api.getContracts()]).then(
      ([organizations, contacts, contracts]) => setData({ organizations, contacts, contracts }),
    );
  }, []);

  const orgsById = useMemo(() => byId(data.organizations), [data.organizations]);
  const contactsById = useMemo(() => byId(data.contacts), [data.contacts]);

  const counts = {
    contacts: data.contacts.filter((c) => c.status === 'active').length,
    orgs: data.organizations.length,
    contracts: data.contracts.filter((k) => k.status === 'active').length,
    archived: data.contacts.filter((c) => c.status !== 'active').length,
  };

  const props = { ...data, orgsById, contactsById };

  return (
    <SettingsContext.Provider value={settingsState}>
      <div className="app">
        <Sidebar page={page} onNavigate={setPage} counts={counts} theme={theme} />
        <main className="main">
          {page === 'contacts' && <ContactsPage {...props} />}
          {page === 'recent' && <RecentPage {...props} />}
          {page === 'orgs' && <OrganizationsPage {...props} />}
          {page === 'contracts' && <ContractsPage {...props} />}
          {page === 'archived' && <ArchivedPage {...props} />}
          {page === 'settings' && <SettingsPage theme={theme} />}
        </main>
      </div>
    </SettingsContext.Provider>
  );
}
