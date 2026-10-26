// Electron main process: opens the app window.
// Database (Adrian) and auth (Nic) handlers get registered here with ipcMain.handle(...)
// so the UI can call them through the preload bridge. See docs/API.md.
const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

app.setName('Contractor CRM');

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
    },
  });

  // Phone links (tel:, sms:) open the system app; nothing else leaves the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('tel:') || url.startsWith('sms:')) shell.openExternal(url);
    return { action: 'deny' };
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    win.loadURL(devUrl);
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
