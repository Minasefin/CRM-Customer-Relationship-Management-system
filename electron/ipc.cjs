// Safe way to connect database and auth functions to the UI.
//
//   const { handle } = require('./ipc.cjs');
//   handle('db:getContacts', async () => db.getContacts());
//   handle('db:addNote', async (contactId, text) => db.addNote(contactId, text));
//
// Then in preload.cjs expose ONE named function per channel (never ipcRenderer itself):
//   getContacts: () => ipcRenderer.invoke('db:getContacts'),
//
// handle() rejects calls that don't come from the app's own page, and never sends
// internal error details (file paths, SQL, stack traces) back to the page.
const { app, ipcMain } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

// The dev server address is only trusted while developing, and only on this computer.
// A packaged app ignores VITE_DEV_SERVER_URL so nobody can point it at another website.
function devUrl() {
  if (app.isPackaged) return null;
  const raw = process.env.VITE_DEV_SERVER_URL;
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
    return local && u.protocol === 'http:' ? u.origin + '/' : null;
  } catch {
    return null;
  }
}
const DEV_URL = devUrl();
const DIST_URL = pathToFileURL(path.join(__dirname, '..', 'dist') + path.sep).href;

function isAppUrl(url) {
  if (!url) return false;
  if (DEV_URL && url.startsWith(DEV_URL)) return true;
  if (DEV_URL && /^ws:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(url)) return true; // live reload
  return url.startsWith(DIST_URL);
}

function handle(channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    const sender = event.senderFrame && event.senderFrame.url;
    if (!isAppUrl(sender)) throw new Error('Blocked: request did not come from the app.');
    try {
      return await fn(...args);
    } catch (err) {
      console.error(`[${channel}]`, err); // full detail stays in the terminal, not the page
      throw new Error(err && err.userMessage ? err.userMessage : 'Something went wrong. Try again.');
    }
  });
}

module.exports = { handle, isAppUrl, DEV_URL };
