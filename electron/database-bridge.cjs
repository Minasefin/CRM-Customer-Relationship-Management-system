// Connects Adrian's database (database/index.cjs) to the app's screens.
//
// Until Nic's login exists, the database can only be opened with a DEVELOPMENT-ONLY key:
//   npm run dev:db        (creates a local .dev-key file the first time; never committed)
// That path is refused in an installed (packaged) app, so it can't become a login bypass.
// Without a key, nothing here loads and the app uses its built-in sample data.
//
// When Nic's login lands: login() derives the key and calls the same openDatabase(key);
// the handlers below don't change.
const { app, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { handle } = require('./ipc.cjs');

// The functions the screens may call. Key and lifecycle functions are never exposed.
const UI_FUNCTIONS = [
  'getOrganizations', 'getOrganization', 'createOrganization', 'updateOrganization', 'archiveOrganization',
  'getContacts', 'getContact', 'createContact', 'updateContact', 'setContactStatus', 'moveContact',
  'getEmploymentHistory', 'getAllEmployment', 'addNote', 'updateNote',
  'getContracts', 'createContract', 'updateContract', 'archiveContract',
];

let status = { enabled: false, mode: 'sample', error: null };

function devKeyFromEnv() {
  if (app.isPackaged) return null; // installed app: never accept a key from the environment
  const hex = (process.env.CRM_DEV_KEY || '').trim();
  if (!hex) return null;
  if (!/^[0-9a-f]{64}$/i.test(hex)) {
    status.error = 'The development key must be 64 hex characters. Delete .dev-key and run npm run dev:db again.';
    return null;
  }
  return Buffer.from(hex, 'hex');
}

async function setupDatabaseBridge() {
  // Answered once by the preload script so it knows whether to expose the database functions.
  ipcMain.on('crm:dbStatus', (event) => {
    event.returnValue = { ...status };
  });

  const key = devKeyFromEnv();
  if (!key) return status;

  let db;
  try {
    // Loaded only here, so the installed app and `npm run dev` never touch the native module.
    const { createDatabase } = require('../database/index.cjs');
    const file = path.join(app.getPath('userData'), 'dev', 'crm-dev.db');
    if (process.env.CRM_DEV_RESET === '1') {
      for (const f of [file, `${file}-journal`, `${file}-wal`, `${file}-shm`]) fs.rmSync(f, { force: true });
    }
    db = createDatabase(file);
    db.openDatabase(key);
    await require('./dev-seed.cjs').seedIfEmpty(db, file, key);
    status = { enabled: true, mode: 'dev-database', error: null };
  } catch (err) {
    console.error('[database] could not open the development database:', err && err.message);
    status = {
      enabled: false,
      mode: 'sample',
      error:
        (err && err.userMessage) ||
        'The test database could not be opened. If the key changed, run: npm run dev:db -- --reset',
    };
    try {
      db && db.closeDatabase();
    } catch {}
    return status;
  } finally {
    key.fill(0); // the database keeps its own copy; wipe ours
  }

  for (const name of UI_FUNCTIONS) handle(`db:${name}`, (...args) => db[name](...args));
  app.on('before-quit', () => db.closeDatabase());
  return status;
}

module.exports = { setupDatabaseBridge, UI_FUNCTIONS };
