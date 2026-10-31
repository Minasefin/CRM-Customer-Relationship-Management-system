'use strict';
const { app, BrowserWindow, powerMonitor } = require('electron');
const { handle } = require('./ipc.cjs');
const { createAuth } = require('../auth/index.cjs');

const AUTH_FUNCTIONS = ['isSetUp', 'setUpPassword', 'login', 'logout', 'changePassword'];

function setupAuthBridge(database) {
  const auth = createAuth({
    database,
    directory: app.getPath('userData'),
    onLock() {
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) window.webContents.send('crm:locked');
      }
    },
  });
  for (const name of AUTH_FUNCTIONS) handle(`auth:${name}`, (...args) => auth[name](...args));

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
  return auth;
}

function disableAuthForDevelopmentDatabase() {
  for (const name of AUTH_FUNCTIONS) handle(`auth:${name}`, () => {
    throw Object.assign(new Error('Password login is unavailable in the test-key database. Start the app without dev:db.'),
      { userMessage: 'Password login is unavailable in the test-key database. Start the app without dev:db.' });
  });
}

module.exports = { setupAuthBridge, disableAuthForDevelopmentDatabase };
