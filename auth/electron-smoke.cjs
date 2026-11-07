'use strict';
// Run through node auth/run-electron-smoke.cjs.
// Uses the actual main/preload/UI with an isolated temporary userData directory.
const { app, BrowserWindow, powerMonitor, dialog } = require('electron');
const fs = require('node:fs');
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
  assert.equal(await evaluate('Object.keys(window.crm.api).length'), 33);
  await assert.rejects(call('getContacts'), /locked/);
  await assert.rejects(call('getOrganizationAttachments','missing'), /locked/);
  await assert.rejects(call('getStorageLocation'), /locked/);
  // Locked: the create-password screen is shown, not the app.
  assert.equal(await evaluate('document.body.textContent.includes("Create your password")'), true);
  assert.equal(await evaluate('!!document.querySelector(".sidebar")'), false);

  assert.deepEqual(await call('setUpPassword', first), { ok: true });
  await mode('database');
  assert.equal(await call('isSetUp'), true);
  assert.deepEqual(await call('getContacts'), []);
  const org = await call('createOrganization', { name: 'Synthetic Electron firm' });
  assert.equal((await call('getOrganization', org.id)).name, org.name);
  const contact=await call('createContact',{firstName:'Synthetic',lastName:'Electron',middleName:'Test',prefix:'Dr.',suffix:'III',orgId:org.id});
  assert.equal((await call('getContact',contact.id)).middleName,'Test');
  const attachment=await call('addOrganizationAttachment',org.id,{name:'synthetic.txt',mimeType:'text/plain',dataBase64:Buffer.from('Synthetic Electron attachment').toString('base64')});
  assert.equal((await call('getOrganizationAttachments',org.id))[0].id,attachment.id);
  assert.equal(Buffer.from((await call('getOrganizationAttachment',attachment.id)).dataBase64,'base64').toString(),'Synthetic Electron attachment');
  assert.equal((await call('archiveOrganizationAttachment',attachment.id,true)).archived,true);
  assert.equal((await call('getStorageLocation')).directory,directory);
  const originalPicker=dialog.showOpenDialog;
  dialog.showOpenDialog=async()=>({canceled:true,filePaths:[]});
  assert.deepEqual(await call('chooseStorageLocation'),{canceled:true});
  dialog.showOpenDialog=originalPicker;
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
  assert.equal((await call('login',second)).ok,true);
  await mode('database');
  const target=path.join(directory,'relocated');fs.mkdirSync(target);
  dialog.showOpenDialog=async()=>({canceled:false,filePaths:[target]});
  let relaunched=false,quitRequested=false;
  const originalQuit=app.quit.bind(app);
  app.relaunch=()=>{relaunched=true;};app.quit=()=>{quitRequested=true;};
  // Lock notification can reload the renderer before the IPC result arrives.
  await call('chooseStorageLocation').catch(()=>{});
  await until(()=>relaunched&&quitRequested);
  assert.equal(JSON.parse(fs.readFileSync(path.join(directory,'storage-location.json'),'utf8')).directory,target);
  assert.equal(fs.existsSync(path.join(target,'crm.db')),true);
  assert.equal(fs.existsSync(path.join(target,'auth.json')),true);
  await until(async()=>!wc.isLoading()&&await evaluate("window.crm?.dataMode === 'sample'"));
  await assert.rejects(call('login',second),/Restart/);
  app.quit=originalQuit;
  console.log('PASS Electron: 33 named APIs, names, encrypted attachments, storage picker/copy/restart, auth and locking');
  clearTimeout(watchdog);
  app.quit();
}).catch(() => {
  // Do not dump evaluated source or credential-bearing exceptions.
  console.error('FAIL Electron authentication smoke test');
  clearTimeout(watchdog);
  app.exit(1);
});
