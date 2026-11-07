'use strict';
const { app, BrowserWindow, powerMonitor } = require('electron');
const { handle } = require('./ipc.cjs');
const { createAuth } = require('../auth/index.cjs');

const AUTH_FUNCTIONS = ['isSetUp', 'setUpPassword', 'login', 'logout', 'changePassword', 'getTotpStatus', 'beginTotpSetup', 'confirmTotpSetup', 'loginWithTotp', 'disableTotp'];

function setupAuthBridge(database, directory = app.getPath('userData')) {
  let restartRequired=false;
  const auth = createAuth({
    database,
    directory,
    onLock() {
      // Tell each open window to clear its screen. A window that is closing (red ✕)
      // may already be gone; skip it instead of crashing on the way out.
      for (const window of BrowserWindow.getAllWindows()) {
        try {
          if (!window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.send('crm:locked');
        } catch {}
      }
    },
  });
  for (const name of AUTH_FUNCTIONS) handle(`auth:${name}`, (...args) => {
    if(restartRequired) throw Object.assign(new Error('Restart Auria to use the selected data folder.'),{userMessage:'Restart Auria to use the selected data folder.'});
    return auth[name](...args);
  });

  // Native input events count activity in THIS app. Database polling does not
  // keep a session alive, and there is no renderer-callable keepalive channel.
  app.on('web-contents-created', (_event, contents) => {
    contents.on('before-input-event', () => auth.activity());
    contents.on('before-mouse-event', () => auth.activity());
    contents.on('render-process-gone', () => auth.lock());
    contents.on('destroyed', () => auth.lock());
  });
  powerMonitor.on('suspend', () => auth.lock());
  powerMonitor.on('resume', () => auth.lock()); // defense if a platform missed suspend
  powerMonitor.on('lock-screen', () => auth.lock());
  const timer = setInterval(() => auth.checkInactivity(), 1000);
  timer.unref();
  app.on('before-quit', () => { clearInterval(timer); auth.lock(); });
  return {...auth, requireRestart() { restartRequired=true; auth.lock(); }};
}

function disableAuthForDevelopmentDatabase() {
  for (const name of AUTH_FUNCTIONS) handle(`auth:${name}`, () => {
    throw Object.assign(new Error('Password login is unavailable in the test-key database. Start the app without dev:db.'),
      { userMessage: 'Password login is unavailable in the test-key database. Start the app without dev:db.' });
  });
}

module.exports = { setupAuthBridge, disableAuthForDevelopmentDatabase };
