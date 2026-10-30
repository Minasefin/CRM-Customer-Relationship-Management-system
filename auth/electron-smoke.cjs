'use strict';
// Run through node auth/run-electron-smoke.cjs.
// Uses the actual main/preload/UI with an isolated temporary userData directory.
const { app, BrowserWindow, powerMonitor } = require('electron');
const assert = require('node:assert/strict');
const path = require('node:path');
const { randomBytes } = require('node:crypto');

const directory = process.env.CRM_AUTH_TEST_DIRECTORY;
if (!directory || !path.basename(directory).startsWith('crm-auth-electron-')) throw new Error('Use the smoke-test runner.');
process.env.CRM_USER_DATA = directory;
delete process.env.CRM_DEV_KEY;
delete process.env.VITE_DEV_SERVER_URL;
require('../electron/main.cjs');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try { const value = await fn(); if (value) return value; } catch {}
    await wait(50);
  }
  throw new Error('Timed out waiting for Electron state');
}
const watchdog = setTimeout(() => { console.error('Electron smoke test timed out'); app.exit(1); }, 60000);

app.whenReady().then(async () => {
  const window = await until(() => BrowserWindow.getAllWindows()[0]);
  const wc = window.webContents;
  const evaluate = source => wc.executeJavaScript(source);
  const call = (name, ...args) => evaluate(`window.crm.api[${JSON.stringify(name)}](...${JSON.stringify(args)})`);
  const mode = expected => until(async () => !wc.isLoading() && await evaluate(`window.crm?.dataMode === ${JSON.stringify(expected)} && !!document.querySelector(${JSON.stringify(expected === 'sample' ? '.auth-card' : '.sidebar')})`));
  const first = `Synthetic Electron ${randomBytes(16).toString('hex')}`;
  const second = `Synthetic replacement ${randomBytes(16).toString('hex')}`;
  await mode('sample');
  assert.equal(await call('isSetUp'), false);
  assert.equal(await evaluate('Object.keys(window.crm.api).length'), 24);
  await assert.rejects(call('getContacts'), /locked/);
  // Locked: the create-password screen is shown, not the app.
  assert.equal(await evaluate('document.body.textContent.includes("Create your password")'), true);
  assert.equal(await evaluate('!!document.querySelector(".sidebar")'), false);

  assert.deepEqual(await call('setUpPassword', first), { ok: true });
  await mode('database');
  assert.equal(await call('isSetUp'), true);
  assert.deepEqual(await call('getContacts'), []);
  const org = await call('createOrganization', { name: 'Synthetic Electron firm' });
  assert.equal((await call('getOrganization', org.id)).name, org.name);
  assert.deepEqual(await call('changePassword', first, second), { ok: true });

  assert.deepEqual(await call('logout'), { ok: true });
  await mode('sample');
  await assert.rejects(call('getOrganizations'), /locked/);
  assert.equal(await evaluate('document.body.textContent.includes("Synthetic Electron firm")'), false);
  assert.equal((await call('login', first)).ok, false);
  await wait(1100);
  assert.deepEqual(await call('login', second), { ok: true });
  await mode('database');
  assert.equal((await call('getOrganizations')).length, 1);
  powerMonitor.emit('suspend');
  await mode('sample');
  await assert.rejects(call('getContacts'), /locked/);
  assert.equal((await call('login', second)).ok, true);
  await mode('database');
  powerMonitor.emit('lock-screen');
  await mode('sample');
  console.log('PASS Electron: sample mode, setup, 24 named API actions, encrypted data, rekey, logout, login, sleep and screen lock');
  clearTimeout(watchdog);
  app.quit();
}).catch(() => {
  // Do not dump evaluated source or credential-bearing exceptions.
  console.error('FAIL Electron authentication smoke test');
  clearTimeout(watchdog);
  app.exit(1);
});
