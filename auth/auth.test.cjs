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

// Independent authenticator-side implementation: consumes the provisioning URI,
// not the server's token helper. No renderer or Microsoft services are involved.
function authenticatorCode(uri, time) {
  const url = new URL(uri);
  assert.equal(url.protocol, 'otpauth:');
  assert.equal(url.hostname, 'totp');
  assert.equal(url.searchParams.get('algorithm'), 'SHA1');
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bits = [...url.searchParams.get('secret')].map(c => alphabet.indexOf(c).toString(2).padStart(5, '0')).join('');
  const key = Buffer.from(bits.match(/.{8}/g).map(b => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(time / (Number(url.searchParams.get('period')) * 1000))));
  const digest = require('node:crypto').createHmac('sha1', key).update(counter).digest();
  const number = digest.readUInt32BE(digest[digest.length - 1] & 15) & 0x7fffffff;
  return String(number % 10 ** Number(url.searchParams.get('digits'))).padStart(6, '0');
}

test('RFC 6238 SHA-1 reference vectors and acceptance window', () => {
  const { token, matchStep } = require('./totp.cjs');
  const key = Buffer.from('12345678901234567890'); // public RFC test vector
  const times = [59, 1111111109, 1111111111, 1234567890, 2000000000, 20000000000];
  const expected = ['94287082', '07081804', '14050471', '89005924', '69279037', '65353130'];
  times.forEach((time, i) => assert.equal(token(key, Math.floor(time / 30), 8), expected[i]));
  const time = 300000;
  for (const offset of [-1, 0, 1]) assert.equal(matchStep(key, token(key, 10 + offset), time), 10 + offset);
  assert.equal(matchStep(key, token(key, 8), time), null);
  assert.equal(matchStep(key, token(key, 10), time, 10), null);
  for (const code of [null, 123456, {}, '12345', '1234567', ' 123456']) assert.equal(matchStep(key, code, time), null);
});

test('real scrypt and database: authenticator URI enrollment, login, replay, recovery and rekey', async t => {
  let time = 300000;
  const f = fixture(t, { deriveKey: undefined, now: () => time, monotonicNow: () => time });
  const first = phrase(), second = phrase();
  assert.deepEqual(await f.auth.getTotpStatus(), { enabled: false });
  await f.auth.setUpPassword(first);
  const enrollment = await f.auth.beginTotpSetup(first);
  assert.equal(enrollment.ok, true);
  assert.equal(enrollment.secret.length, 32);
  assert.deepEqual(await f.auth.getTotpStatus(), { enabled: false });
  const confirmed = await f.auth.confirmTotpSetup(authenticatorCode(enrollment.otpauthUri, time));
  assert.equal(confirmed.ok, true);
  assert.equal(new Set(confirmed.recoveryCodes).size, 10);
  assert.deepEqual(await f.auth.getTotpStatus(), { enabled: true });
  const org = await f.database.createOrganization({ name: 'Synthetic TOTP firm' });
  const metadata = JSON.stringify(f.state());
  assert.equal(f.state().version, 2);
  assert.equal(metadata.includes(enrollment.secret), false);
  confirmed.recoveryCodes.forEach(code => assert.equal(metadata.includes(code), false));
  f.restart();
  assert.equal((await f.auth.login(first)).ok, false);
  assert.equal(f.database.isOpen(), false);
  time += 2000;
  assert.equal((await f.auth.loginWithTotp(first, authenticatorCode(enrollment.otpauthUri, time))).ok, false); // enrollment code already consumed
  time += 30000;
  assert.deepEqual(await f.auth.loginWithTotp(first, authenticatorCode(enrollment.otpauthUri, time)), { ok: true });
  assert.equal((await f.database.getOrganization(org.id)).name, 'Synthetic TOTP firm');
  f.restart();
  assert.equal((await f.auth.loginWithTotp(first, authenticatorCode(enrollment.otpauthUri, time))).ok, false);
  time += 61000;
  assert.deepEqual(await f.auth.loginWithTotp(first, confirmed.recoveryCodes[0]), { ok: true });
  assert.deepEqual(await f.auth.changePassword(first, second), { ok: true });
  f.restart();
  assert.equal((await f.auth.loginWithTotp(second, confirmed.recoveryCodes[0])).ok, false);
  time += 61000;
  assert.deepEqual(await f.auth.loginWithTotp(second, authenticatorCode(enrollment.otpauthUri, time)), { ok: true });
  assert.deepEqual(await f.auth.disableTotp(second, confirmed.recoveryCodes[1]), { ok: true });
  f.restart();
  assert.deepEqual(await f.auth.getTotpStatus(), { enabled: false });
  assert.deepEqual(await f.auth.login(second), { ok: true });
});

test('enrollment requires session/password, expires, cancels on lock, throttles and never enables on invalid code', async t => {
  const f = fixture(t);
  const password = phrase();
  assert.equal((await f.auth.beginTotpSetup(password)).ok, false);
  await f.auth.setUpPassword(password);
  assert.equal((await f.auth.beginTotpSetup(phrase())).ok, false);
  assert.match((await f.auth.beginTotpSetup(password)).error, /wait/);
  f.advance();
  assert.equal((await f.auth.beginTotpSetup(password)).ok, true);
  assert.equal((await f.auth.confirmTotpSetup('bad')).ok, false);
  assert.match((await f.auth.confirmTotpSetup('bad')).error, /wait/);
  assert.deepEqual(await f.auth.getTotpStatus(), { enabled: false });
  f.advance(300001);
  assert.match((await f.auth.confirmTotpSetup('123456')).error, /expired/);
  assert.equal((await f.auth.beginTotpSetup(password)).ok, true);
  f.restart();
  assert.equal((await f.auth.login(password)).ok, true);
  assert.match((await f.auth.confirmTotpSetup('123456')).error, /expired/);
});

for (const afterRekey of [false, true]) {
  test(`TOTP survives interrupted rekey (${afterRekey ? 'after' : 'before'} database change)`, async t => {
    let fail = false, time = 300000;
    const f = fixture(t, { now: () => time, monotonicNow: () => time, writeState: (file, state) => {
      if (fail && state.operation === null && state.failures === 0) throw new Error('Injected commit failure');
      atomicWrite(file, state);
    } });
    const first = phrase(), second = phrase();
    await f.auth.setUpPassword(first);
    const enrollment = await f.auth.beginTotpSetup(first);
    await f.auth.confirmTotpSetup(authenticatorCode(enrollment.otpauthUri, time));
    if (!afterRekey) f.database.rekeyDatabase = () => { throw new Error('Injected rekey failure'); };
    fail = true;
    assert.equal((await f.auth.changePassword(first, second)).ok, false);
    fail = false; f.restart(); time += 61000;
    const survivor = afterRekey ? second : first;
    assert.equal((await f.auth.login(survivor)).ok, false);
    time += 61000;
    assert.deepEqual(await f.auth.loginWithTotp(survivor, authenticatorCode(enrollment.otpauthUri, time)), { ok: true });
    assert.deepEqual(await f.auth.getTotpStatus(), { enabled: true });
  });
}

test('TOTP consumption write failure never unlocks (database closed again); corrupt ciphertext fails closed', async t => {
  let fail = false, writes = 0, time = 300000;
  const f = fixture(t, { now: () => time, monotonicNow: () => time, writeState: (file, state) => {
    if (fail && ++writes === 2) throw new Error('Injected consumption write failure');
    atomicWrite(file, state);
  } });
  const password = phrase();
  await f.auth.setUpPassword(password);
  const enrollment = await f.auth.beginTotpSetup(password);
  await f.auth.confirmTotpSetup(authenticatorCode(enrollment.otpauthUri, time));
  f.restart(); time += 61000; fail = true;
  assert.equal((await f.auth.loginWithTotp(password, authenticatorCode(enrollment.otpauthUri, time))).ok, false);
  assert.equal(f.database.isOpen(), false);
  fail = false; time += 61000;
  const state = f.state();
  state.current.totp.tag = '00'.repeat(16);
  atomicWrite(path.join(f.directory, 'auth.json'), state);
  assert.equal((await f.auth.loginWithTotp(password, authenticatorCode(enrollment.otpauthUri, time))).ok, false);
  assert.equal(f.database.isOpen(), false);
});


test('lock during TOTP enrollment derivation cancels setup and wipes material', async t => {
  let pause = false, release, material;
  const f = fixture(t, { deriveKey: async (...args) => {
    const result = await fastDerive(...args);
    if (pause) { material = result; await new Promise(resolve => { release = resolve; }); }
    return result;
  } });
  const password = phrase();
  await f.auth.setUpPassword(password);
  pause = true;
  const pending = f.auth.beginTotpSetup(password);
  while (!release) await new Promise(resolve => setImmediate(resolve));
  assert.equal((await f.auth.beginTotpSetup(password)).ok, false);
  f.auth.lock(); release();
  assert.equal((await pending).ok, false);
  assert.equal(material.every(byte => byte === 0), true);
  assert.deepEqual(await f.auth.getTotpStatus(), { enabled: false });
});

test('interactive phone harness exercises real backend and cleans up on quit and interruption', async () => {
  const { run } = require('./phone-test.cjs');
  const output = [];
  const recovery = [];
  let uri;
  const actions = ['c', 'o', 'l', 'r', 'l', 'd', 'o', 'p', 'q'];
  await run({
    show: line => {
      output.push(line);
      if (line.startsWith('Secret key: ')) uri = `otpauth://totp/test?secret=${line.slice(12)}&algorithm=SHA1&digits=6&period=30`;
      if (/^[a-f0-9]{32}$/.test(line)) recovery.push(line);
    },
    ask: async prompt => {
      if (prompt === 'Action: ') return actions.shift() || 'q';
      if (prompt === 'Phone code: ') return authenticatorCode(uri, Date.now());
      return recovery.shift();
    },
  });
  assert.equal(actions.length, 0);
  assert.equal(output.some(line => line.startsWith('REFUSED:')), false);
  assert.equal(output.filter(line => line === 'OK').length, 7);
  assert.ok(output.includes('TOTP: enabled | Session: unlocked'));
  assert.ok(output.includes('TOTP: disabled | Session: unlocked'));
  assert.match(output.at(-1), /Temporary test files removed/);
  const interrupted = [];
  await assert.rejects(run({
    show: line => interrupted.push(line),
    ask: async () => { throw Object.assign(new Error('Test cancellation'), { code: 'ABORT_ERR' }); },
  }), { code: 'ABORT_ERR' });
  assert.match(interrupted.at(-1), /Temporary test files removed/);
});

test('2FA cannot be switched off by editing or swapping auth.json (flag inside the encrypted database)', async t => {
  let time = 300000;
  const f = fixture(t, { now: () => time, monotonicNow: () => time });
  const file = path.join(f.directory, 'auth.json');
  const password = phrase();
  await f.auth.setUpPassword(password);
  const beforeEnrollment = fs.readFileSync(file);
  assert.equal(f.database.secondFactorRequired(), false);
  const enrollment = await f.auth.beginTotpSetup(password);
  const confirmed = await f.auth.confirmTotpSetup(authenticatorCode(enrollment.otpauthUri, time));
  assert.equal(confirmed.ok, true);
  assert.equal(f.database.secondFactorRequired(), true);
  const enrolled = fs.readFileSync(file);

  // 1. Restore the auth.json from before 2FA was turned on: password alone is refused.
  f.restart(); time += 61000;
  fs.writeFileSync(file, beforeEnrollment);
  const rolledBack = await f.auth.login(password);
  assert.equal(rolledBack.ok, false);
  assert.match(rolledBack.error, /Two-step sign-in is turned on/);
  assert.equal(f.database.isOpen(), false);
  assert.equal(f.auth.isUnlocked(), false);

  // 2. Strip the 2FA part out of the current auth.json: also refused.
  f.restart(); time += 61000;
  const stripped = JSON.parse(enrolled.toString());
  delete stripped.current.totp; stripped.version = 1; stripped.failures = 0; stripped.nextAllowedAt = 0;
  fs.writeFileSync(file, JSON.stringify(stripped));
  assert.equal((await f.auth.login(password)).ok, false);
  assert.equal(f.database.isOpen(), false);

  // 3. The real file with a real code still works.
  f.restart(); time += 61000;
  fs.writeFileSync(file, enrolled);
  const state = JSON.parse(enrolled.toString()); state.failures = 0; state.nextAllowedAt = 0;
  atomicWrite(file, state);
  assert.deepEqual(await f.auth.loginWithTotp(password, authenticatorCode(enrollment.otpauthUri, time)), { ok: true });

  // 4. Flag write cut short when 2FA was turned on: sign-in still needs a code, and sets the flag.
  f.database.setSecondFactorRequired(false);
  f.restart(); time += 61000;
  assert.equal((await f.auth.login(password)).ok, false);
  time += 61000;
  assert.deepEqual(await f.auth.loginWithTotp(password, confirmed.recoveryCodes[0]), { ok: true });
  assert.equal(f.database.secondFactorRequired(), true);

  // 5. Turning 2FA off properly clears the flag; password alone works again.
  time += 61000;
  assert.deepEqual(await f.auth.disableTotp(password, confirmed.recoveryCodes[1]), { ok: true });
  assert.equal(f.database.secondFactorRequired(), false);
  f.restart(); time += 61000;
  assert.deepEqual(await f.auth.login(password), { ok: true });
});
