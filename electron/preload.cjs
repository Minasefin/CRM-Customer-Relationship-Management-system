// The only bridge between the UI and the rest of the app.
//
// Rules (see SECURITY.md):
// - Expose one named function per action. NEVER expose ipcRenderer, require, or a
//   generic "send any channel" function. The page should only be able to do the
//   exact things listed in docs/API.md.
// - Pass plain values in and out. Never pass callbacks or Node objects.
//
// Auth is always exposed. dataMode tells the UI whether data calls are unlocked.
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

const api = Object.fromEntries(
  DB_FUNCTIONS.map((name) => [
    name,
    (...args) => ipcRenderer.invoke(`db:${name}`, ...args).catch((err) => {
      throw clean(err);
    }),
  ]),
);

let loggingOut = false;
for (const name of ['isSetUp', 'setUpPassword', 'login', 'logout', 'changePassword']) {
  api[name] = async (...args) => {
    if (name === 'logout') loggingOut = true;
    try {
      const result = await ipcRenderer.invoke(`auth:${name}`, ...args);
      // Recreate the UI with the unlocked dataMode and discard sample state.
      if ((name === 'login' || name === 'setUpPassword') && result.ok) setTimeout(() => location.reload(), 0);
      return result;
    } catch (err) { throw clean(err); }
    finally {
      if (name === 'logout') {
        loggingOut = false;
        setTimeout(() => location.reload(), 0);
      }
    }
  };
}

ipcRenderer.on('crm:locked', () => {
  // Clear rendered contact data immediately, then discard all renderer state.
  document.documentElement?.replaceChildren();
  if (!loggingOut) location.reload();
});

contextBridge.exposeInMainWorld('crm', {
  platform: process.platform,
  dataMode: status.mode, // 'database', 'dev-database', or 'sample' while locked
  dataError: status.error, // why the database didn't open, if it was supposed to
  api,
});
