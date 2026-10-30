// The only bridge between the UI and the rest of the app.
//
// Rules (see SECURITY.md):
// - Expose one named function per action. NEVER expose ipcRenderer, require, or a
//   generic "send any channel" function. The page should only be able to do the
//   exact things listed in docs/API.md.
// - Pass plain values in and out. Never pass callbacks or Node objects.
//
// window.crm.api only exists when the main process opened a database (today: the
// development database from `npm run dev:db`). Otherwise the UI uses sample data.
const { contextBridge, ipcRenderer } = require('electron');

const DB_FUNCTIONS = [
  'getOrganizations', 'getOrganization', 'createOrganization', 'updateOrganization', 'archiveOrganization',
  'getContacts', 'getContact', 'createContact', 'updateContact', 'setContactStatus', 'moveContact',
  'getEmploymentHistory', 'getAllEmployment', 'addNote', 'updateNote',
  'getContracts', 'createContract', 'updateContract', 'archiveContract',
];

// Electron wraps errors as "Error invoking remote method 'db:x': Error: <message>".
// Keep only the readable message the database meant for the person.
const clean = (err) => {
  const msg = String((err && err.message) || err || 'Something went wrong.');
  return new Error(msg.replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/, ''));
};

const status = ipcRenderer.sendSync('crm:dbStatus') || { enabled: false, mode: 'sample', error: null };

const api = status.enabled
  ? Object.fromEntries(
      DB_FUNCTIONS.map((name) => [
        name,
        (...args) =>
          ipcRenderer.invoke(`db:${name}`, ...args).catch((err) => {
            throw clean(err);
          }),
      ]),
    )
  : undefined;

contextBridge.exposeInMainWorld('crm', {
  platform: process.platform,
  dataMode: status.mode, // 'dev-database' or 'sample'
  dataError: status.error, // why the database didn't open, if it was supposed to
  ...(api ? { api } : {}),
});
