'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomBytes, hkdfSync } = require('node:crypto');
const { createDatabase } = require('../database/index.cjs');
const { createAuth, atomicWrite, IDLE_MS } = require('./index.cjs');
const { validateNewPassword } = require('./password-policy.cjs');

const phrase = () => `Synthetic phrase ${randomBytes(16).toString('hex')}`;
// Fault/race tests use a cheap deterministic stand-in. The lifecycle test uses
// production scrypt and the real encrypted database, including reopen and rekey.
const fastDerive = async (value, salt) => Buffer.from(hkdfSync('sha256', Buffer.from(value), Buffer.from(salt, 'hex'), 'auth-test-only', 64));

function fixture(t, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-auth-test-'));
  const databaseFile = path.join(directory, 'crm.db');
  const database = createDatabase(databaseFile);
  let time = 100000;
  let locks = 0;
  const config = { database, directory, now: () => time, monotonicNow: () => time,
    onLock: () => locks++, deriveKey: fastDerive, ...options };
  let auth = createAuth(config);
  t.after(() => { database.closeDatabase(); fs.rmSync(directory, { recursive: true, force: true }); });
  return { directory, databaseFile, database, get auth() { return auth; }, get locks() { return locks; },
    advance: (ms = 61000) => { time += ms; },
    restart: (overrides = {}) => { auth.lock(); auth = createAuth({ ...config, ...overrides }); return auth; },
    state: () => JSON.parse(fs.readFileSync(path.join(directory, 'auth.json'), 'utf8')) };
}

test('password policy: Unicode, spaces, full length and offline blocklist', () => {
  const value = phrase();
  assert.equal(validateNewPassword(`  ${value}  `), `  ${value}  `);
  assert.equal(validateNewPassword('e\u0301' + value), 'é' + value);
  assert.doesNotThrow(() => validateNewPassword('🙂'.repeat(14) + 'a'));
  assert.throws(() => validateNewPassword('🙂'.repeat(13) + 'a'), /at least 15/);
  assert.doesNotThrow(() => validateNewPassword('x'.repeat(127) + 'y'));
  assert.throws(() => validateNewPassword('x'.repeat(128) + 'y'), /128/);
  for (const value of [null, {}, [], 123, 'x'.repeat(300), '\ud800'.repeat(15)]) assert.throws(() => validateNewPassword(value));
  for (const value of ['passwordpassword', '1234567890123456', '123456789123456789', 'a'.repeat(16), ' '.repeat(16), 'contractor crm password']) {
    assert.throws(() => validateNewPassword(value), /common|compromised/);
  }
});

test('real scrypt: setup, encrypted persistence, login, password change and old-password refusal', async t => {
  const f = fixture(t, { deriveKey: undefined });
  const first = phrase(), second = phrase();
  assert.equal(await f.auth.isSetUp(), false);
  assert.throws(() => f.auth.assertUnlocked(), /locked/);
  await assert.rejects(f.auth.setUpPassword('short'), /15/);
  assert.deepEqual(await f.auth.setUpPassword(first), { ok: true });
  const before = f.state();
  assert.equal(before.current.salt.length, 32);
  await assert.rejects(f.auth.setUpPassword(second), /already/);
  const org = await f.database.createOrganization({ name: 'Synthetic auth test firm' });
  await f.auth.logout();
  assert.equal(f.database.isOpen(), false);
  await assert.rejects(f.database.getOrganizations(), /locked/);
  assert.equal((await f.auth.login(phrase())).ok, false);
  assert.match((await f.auth.login(first)).error, /wait/);
  f.advance();
  assert.deepEqual(await f.auth.login(first), { ok: true });
  assert.equal((await f.database.getOrganization(org.id)).name, 'Synthetic auth test firm');
  assert.deepEqual(await f.auth.changePassword(first, second), { ok: true });
  assert.notEqual(f.state().current.salt, before.current.salt);
  assert.equal(f.state().pending, null);
  f.restart();
  assert.equal((await f.auth.login(first)).ok, false);
  f.advance();
  assert.deepEqual(await f.auth.login(second), { ok: true });
  assert.equal((await f.database.getOrganizations()).length, 1);
  const bytes = fs.readFileSync(f.databaseFile);
  assert.equal(bytes.includes(Buffer.from('Synthetic auth test firm')), false);
  const metadata = fs.readFileSync(path.join(f.directory, 'auth.json'), 'utf8');
  assert.equal(metadata.includes(first), false);
  assert.equal(metadata.includes(second), false);
});

test('throttle survives restart, grows, caps at 60s and counts old-password guesses', async t => {
  const f = fixture(t);
  const value = phrase();
  await f.auth.setUpPassword(value);
  await f.auth.logout();
  let delay = 1000;
  for (let i = 0; i < 9; i++) {
    assert.equal((await f.auth.login(null)).ok, false);
    const state = f.state();
    f.restart();
    assert.match((await f.auth.login(value)).error, /wait/);
    f.advance(delay - 1);
    assert.match((await f.auth.login(value)).error, /wait/);
    f.advance(1);
    assert.equal(f.state().failures, state.failures);
    delay = Math.min(delay * 2, 60000);
  }
  assert.equal((await f.auth.login(value)).ok, true);
  assert.equal(f.state().failures, 0);
  assert.equal((await f.auth.changePassword(phrase(), phrase())).ok, false);
  assert.match((await f.auth.changePassword(value, phrase())).error, /wait/);
});

test('inactivity expires at 15 minutes; late input cannot revive the session', async t => {
  const f = fixture(t);
  const value = phrase();
  await f.auth.setUpPassword(value);
  f.advance(IDLE_MS - 1);
  f.auth.assertUnlocked();
  f.auth.activity();
  f.advance(IDLE_MS - 1);
  f.auth.checkInactivity();
  assert.equal(f.auth.isUnlocked(), true);
  f.advance(1);
  f.auth.activity();
  assert.equal(f.auth.isUnlocked(), false);
  assert.equal(f.locks, 1);
  assert.throws(() => f.auth.assertUnlocked(), /locked/);
});

for (const operation of ['setup', 'login']) {
  test(`${operation}: logout during derivation cancels unlock and wipes key material`, async t => {
    const f = fixture(t);
    const value = phrase();
    if (operation !== 'setup') await f.auth.setUpPassword(value);
    let release;
    let material;
    const auth = f.restart({ deriveKey: async (...args) => {
      material = await fastDerive(...args);
      await new Promise(resolve => { release = resolve; });
      return material;
    } });
    const pending = operation === 'setup' ? auth.setUpPassword(value) : auth.login(value);
    while (!release) await new Promise(resolve => setImmediate(resolve));
    assert.equal((await auth.login(value)).ok, false); // overlapping operations never queue passwords
    await auth.logout();
    release();
    if (operation === 'setup') await assert.rejects(pending, /locked/);
    else assert.equal((await pending).ok, false);
    assert.equal(material.every(byte => byte === 0), true);
    assert.equal(f.database.isOpen(), false);
  });
}

test('password change canceled by sleep/lock does not rekey or reopen', async t => {
  let pause = false, release, material;
  const f = fixture(t, { deriveKey: async (...args) => {
    const result = await fastDerive(...args);
    if (pause) { material = result; await new Promise(resolve => { release = resolve; }); }
    return result;
  } });
  const value = phrase();
  await f.auth.setUpPassword(value);
  pause = true;
  const pending = f.auth.changePassword(value, phrase());
  while (!release) await new Promise(resolve => setImmediate(resolve));
  f.auth.lock(); release();
  assert.equal((await pending).ok, false);
  assert.equal(material.every(byte => byte === 0), true);
  assert.equal(f.database.isOpen(), false);
  pause = false; f.advance();
  assert.equal((await f.auth.login(value)).ok, true);
});

for (const afterRekey of [false, true]) {
  test(`interrupted password change recovers ${afterRekey ? 'new' : 'old'} credentials against the real database`, async t => {
    let failCommit = false;
    const f = fixture(t, { writeState: (file, state) => {
      if (failCommit && state.operation === null && state.failures === 0) throw new Error('Injected write failure');
      atomicWrite(file, state);
    } });
    const first = phrase(), second = phrase();
    await f.auth.setUpPassword(first);
    await f.database.createOrganization({ name: 'Synthetic recovery firm' });
    if (!afterRekey) f.database.rekeyDatabase = () => { throw new Error('Injected pre-rekey failure'); };
    failCommit = true;
    assert.equal((await f.auth.changePassword(first, second)).ok, false);
    assert.equal(f.state().operation, 'change');
    assert.equal(f.database.isOpen(), false);
    failCommit = false; f.restart(); f.advance();
    assert.equal((await f.auth.login(afterRekey ? first : second)).ok, false);
    f.advance();
    assert.equal((await f.auth.login(afterRekey ? second : first)).ok, true);
    assert.equal(f.state().pending, null);
    assert.equal((await f.database.getOrganizations()).length, 1);
  });
}

test('interrupted setup can finish using its pending credential', async t => {
  let failCommit = true;
  const f = fixture(t, { writeState: (file, state) => {
    if (failCommit && state.operation === null) throw new Error('Injected write failure');
    atomicWrite(file, state);
  } });
  const value = phrase();
  await assert.rejects(f.auth.setUpPassword(value));
  assert.equal(f.state().operation, 'setup');
  assert.equal(await f.auth.isSetUp(), true);
  failCommit = false; f.restart();
  assert.equal((await f.auth.login(value)).ok, true);
  assert.equal(f.state().operation, null);
});

test('missing or corrupt metadata and missing established database fail closed', async t => {
  const f = fixture(t);
  const value = phrase();
  await f.auth.setUpPassword(value);
  await f.auth.logout();
  const filename = path.join(f.directory, 'auth.json');
  const metadata = fs.readFileSync(filename);
  fs.writeFileSync(filename, '{');
  await assert.rejects(f.auth.isSetUp());
  assert.equal((await f.auth.login(value)).ok, false);
  fs.rmSync(filename);
  await assert.rejects(f.auth.setUpPassword(phrase()));
  assert.equal(f.database.isOpen(), false);
  fs.writeFileSync(filename, metadata);
  fs.rmSync(f.databaseFile);
  assert.equal((await f.auth.login(value)).ok, false);
  assert.equal(fs.existsSync(f.databaseFile), false);
});

test('same-password change is harmless and invalid new passwords do not rekey', async t => {
  const f = fixture(t);
  const value = phrase();
  await f.auth.setUpPassword(value);
  const before = f.state().current;
  assert.equal((await f.auth.changePassword(value, 'short')).ok, false);
  assert.equal((await f.auth.changePassword(value, value)).ok, true);
  assert.deepEqual(f.state().current, before);
});
