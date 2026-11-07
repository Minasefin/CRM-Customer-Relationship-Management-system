// Electron main process: opens the app window and locks it down.
// Database (Adrian) and auth (Nic) handlers get registered with handle() from ./ipc.cjs
// so the UI can call them through the preload bridge. See docs/API.md and SECURITY.md.
const { app, BrowserWindow, shell, session, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { isAppUrl, DEV_URL } = require('./ipc.cjs');
const { setupDatabaseBridge } = require('./database-bridge.cjs');

app.setName('Auria');

// The app was called "Contractor CRM" before v0.2. Its data folder is named after the app,
// so move an existing one across once, the first time Auria starts. Nothing is copied or
// deleted; if the move can't happen (for example the old app is still open), keep using
// the old folder so nobody ends up looking at an empty app.
(function useOldDataFolderIfNeeded() {
  if (!app.isPackaged && process.env.CRM_USER_DATA) return; // tests use their own folder
  const appData = app.getPath('appData');
  const oldDir = path.join(appData, 'Contractor CRM');
  const newDir = path.join(appData, 'Auria');
  const hasData = ['crm.db', 'auth.json'].some((f) => fs.existsSync(path.join(oldDir, f)));
  if (!hasData || fs.existsSync(newDir)) return;
  try {
    fs.renameSync(oldDir, newDir);
  } catch (err) {
    console.error('[startup] could not move the old data folder, using it where it is:', err && err.code);
    app.setPath('userData', oldDir);
  }
})();
// Automated tests run with their own throwaway data folder. Ignored in the installed app.
if (!app.isPackaged && process.env.CRM_USER_DATA) app.setPath('userData', process.env.CRM_USER_DATA);
app.enableSandbox(); // every renderer runs in Chromium's sandbox, no Node.js access

// Links that are allowed to leave the app, opened by the system (phone, messages, mail).
const EXTERNAL_SCHEMES = ['tel:', 'sms:', 'mailto:'];
const openIfExternal = (url) => {
  if (EXTERNAL_SCHEMES.some((s) => url.startsWith(s))) shell.openExternal(url);
};

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    title: 'Auria',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
      spellcheck: false, // spellcheck can send typed words to an online service on some systems
      devTools: !app.isPackaged,
    },
  });

  // New windows: never. tel/sms/mailto go to the system apps.
  win.webContents.setWindowOpenHandler(({ url }) => {
    openIfExternal(url);
    return { action: 'deny' };
  });

  // Navigation: the window can only ever show the app itself.
  win.webContents.on('will-navigate', (event, url) => {
    if (isAppUrl(url)) return;
    event.preventDefault();
    openIfExternal(url);
  });
  win.webContents.on('will-redirect', (event, url) => {
    if (!isAppUrl(url)) event.preventDefault();
  });

  if (DEV_URL) {
    win.loadURL(DEV_URL);
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

// No embedded web views, ever.
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview', (event) => event.preventDefault());
});

// Only one copy of the app can run. Opening it again just brings the existing window forward,
// so there's never a second window popping up after you quit the first.
const isFirstCopy = app.requestSingleInstanceLock();
if (!isFirstCopy) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return createWindow();
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });
}

app.whenReady().then(async () => {
  if (!isFirstCopy) return; // a copy is already open; it was just brought to the front
  // The app needs no camera, microphone, location, notifications, etc. Deny every request.
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);

  // Block every network request that isn't the app's own files (or the local dev server).
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !isAppUrl(details.url) && !details.url.startsWith('devtools://') });
  });

  try {
    await setupDatabaseBridge();
  } catch (err) {
    dialog.showErrorBox('Unable to open data storage', err.userMessage || 'The data folder could not be opened. Reconnect its drive and restart Auria.');
    app.quit();
    return;
  }
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// One-window app: closing the window (red ✕ on Mac) quits it on every system.
app.on('window-all-closed', () => app.quit());
