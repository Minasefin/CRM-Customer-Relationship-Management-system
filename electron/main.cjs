// Electron main process: opens the app window and locks it down.
// Database (Adrian) and auth (Nic) handlers get registered with handle() from ./ipc.cjs
// so the UI can call them through the preload bridge. See docs/API.md and SECURITY.md.
const { app, BrowserWindow, shell, session } = require('electron');
const path = require('path');
const { isAppUrl, DEV_URL } = require('./ipc.cjs');

app.setName('Contractor CRM');
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
    title: 'Contractor CRM',
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

app.whenReady().then(() => {
  // The app needs no camera, microphone, location, notifications, etc. Deny every request.
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);

  // Block every network request that isn't the app's own files (or the local dev server).
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !isAppUrl(details.url) && !details.url.startsWith('devtools://') });
  });

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
