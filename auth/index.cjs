'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { scrypt, randomBytes, createHmac, timingSafeEqual } = require('node:crypto');
const { promisify } = require('node:util');
const { performance } = require('node:perf_hooks');
const { normalize, validateNewPassword } = require('./password-policy.cjs');

const scryptAsync = promisify(scrypt);
const IDLE_MS = 15 * 60 * 1000;
const GENERIC_ERROR = 'Authentication could not be completed. Try again. If this continues, restore a matching database and authentication backup.';
const safeError = message => Object.assign(new Error(message), { userMessage: message });

async function derive(password, salt) {
  const input = Buffer.from(password, 'utf8');
  try {
    return await scryptAsync(input, Buffer.from(salt, 'hex'), 64, { N: 131072, r: 8, p: 1, maxmem: 192 * 1024 * 1024 });
  } finally { input.fill(0); }
}
function checkValue(material) {
  return createHmac('sha256', material.subarray(32)).update('contractor-crm/auth-check/v1').digest();
}
function matches(material, credential) {
  const check = checkValue(material);
  try { return timingSafeEqual(check, Buffer.from(credential.check, 'hex')); }
  finally { check.fill(0); }
}

// Temp-file + fsync + rename: the old or new complete JSON survives interruption.
// A pending credential is committed BEFORE rekey, and removed only AFTER it succeeds.
function atomicWrite(filename, state) {
  fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  const temporary = `${filename}.${randomBytes(8).toString('hex')}.tmp`;
  let fd;
  try {
    fd = fs.openSync(temporary, 'wx', 0o600);
    fs.writeFileSync(fd, JSON.stringify(state));
    fs.fsyncSync(fd);
    fs.closeSync(fd); fd = undefined;
    fs.renameSync(temporary, filename);
    // Windows does not support opening directories this way. NTFS rename still
    // gives atomic replacement; sudden power loss additionally needs backups.
    if (process.platform !== 'win32') {
      const directory = fs.openSync(path.dirname(filename), 'r');
      try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
    }
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    fs.rmSync(temporary, { force: true });
  }
}

function validCredential(value) {
  return value && typeof value === 'object' && /^[a-f0-9]{32}$/.test(value.salt) && /^[a-f0-9]{64}$/.test(value.check);
}
function validateState(state) {
  if (!state || state.version !== 1 || !Number.isInteger(state.failures) || state.failures < 0 || state.failures > 100 ||
      !Number.isSafeInteger(state.nextAllowedAt) || state.nextAllowedAt < 0) throw new Error('Invalid auth metadata');
  const stable = state.operation === null && validCredential(state.current) && state.pending === null;
  const setup = state.operation === 'setup' && state.current === null && validCredential(state.pending);
  const change = state.operation === 'change' && validCredential(state.current) && validCredential(state.pending);
  if (!stable && !setup && !change) throw new Error('Invalid auth metadata');
  return state;
}

function createAuth({ database, directory, databaseFile = path.join(directory, 'crm.db'),
  onLock = () => {}, now = Date.now, monotonicNow = () => performance.now(), writeState = atomicWrite,
  deriveKey = derive } = {}) {
  const filename = path.join(directory, 'auth.json');
  let busy = false;
  let epoch = 0;
  let unlocked = false;
  let lastActivity = 0;

  function readState() {
    if (!fs.existsSync(filename)) {
      if (fs.existsSync(databaseFile)) throw new Error('Database exists without authentication metadata');
      return null;
    }
    if (fs.statSync(filename).size > 4096) throw new Error('Invalid auth metadata');
    return validateState(JSON.parse(fs.readFileSync(filename, 'utf8')));
  }
  function save(state) { writeState(filename, validateState(state)); }
  function lock() {
    epoch++;
    const wasUnlocked = unlocked;
    unlocked = false;
    try { database.closeDatabase(); }
    finally { if (wasUnlocked) onLock(); }
    return { ok: true };
  }
  function checkInactivity() {
    if (unlocked && monotonicNow() - lastActivity >= IDLE_MS) lock();
  }
  function activity() {
    checkInactivity(); // input after the deadline must not revive an expired session
    if (unlocked) lastActivity = monotonicNow();
  }
  function assertUnlocked() {
    checkInactivity();
    if (!unlocked || !database.isOpen() || busy) throw safeError('Database is locked. Sign in again.');
  }
  function assertEpoch(start) {
    if (epoch !== start) throw safeError('The app locked while authentication was in progress. Try again.');
  }
  function reserveAttempt(state) {
    if (now() < state.nextAllowedAt) throw safeError(`Please wait ${Math.ceil((state.nextAllowedAt - now()) / 1000)} seconds before trying again.`);
    state.failures = Math.min(100, state.failures + 1);
    state.nextAllowedAt = now() + Math.min(60000, 1000 * 2 ** Math.min(6, state.failures - 1));
    save(state); // persists across restarts, including termination during scrypt
  }
  function stable(credential) {
    return { version: 1, current: credential, pending: null, operation: null, failures: 0, nextAllowedAt: 0 };
  }
  async function withOperation(fn, rejectOnError = false) {
    if (busy) {
      if (rejectOnError) throw safeError('Authentication is already in progress.');
      return { ok: false, error: 'Authentication is already in progress.' };
    }
    busy = true;
    const start = epoch;
    try { return await fn(start); }
    catch (err) {
      const message = err.userMessage || GENERIC_ERROR;
      if (rejectOnError) throw safeError(message);
      return { ok: false, error: message };
    } finally { busy = false; }
  }
  function newPassword(value) {
    try { return validateNewPassword(value); }
    catch (err) { throw safeError(err.message); }
  }
  function existingPassword(value) {
    try { return normalize(value); }
    catch { throw safeError('Incorrect password.'); }
  }

  const api = {
    async isSetUp() {
      try { return readState() !== null; } catch { throw safeError(GENERIC_ERROR); }
    },
    setUpPassword(value) {
      return withOperation(async start => {
        if (readState() || database.isOpen()) throw safeError('A password is already set up. Sign in instead.');
        const password = newPassword(value);
        const salt = randomBytes(16).toString('hex');
        const material = await deriveKey(password, salt);
        try {
          assertEpoch(start);
          const credential = { salt, check: checkValue(material).toString('hex') };
          save({ ...stable(credential), current: null, pending: credential, operation: 'setup' });
          try {
            database.openDatabase(material.subarray(0, 32));
            save(stable(credential));
            unlocked = true; lastActivity = monotonicNow();
            return { ok: true };
          } catch (err) { lock(); throw err; }
        } finally { material.fill(0); }
      }, true);
    },
    login(value) {
      return withOperation(async start => {
        if (unlocked) throw safeError('The database is already unlocked.');
        const state = readState();
        if (!state) throw safeError('Create a password first.');
        reserveAttempt(state);
        const password = existingPassword(value);
        // During interrupted setup/rekey, the database itself determines which
        // candidate is current. Never promote a check value without opening it.
        for (const credential of [state.pending, state.current].filter(Boolean)) {
          const material = await deriveKey(password, credential.salt);
          try {
            assertEpoch(start);
            if (!matches(material, credential)) continue;
            if (state.operation !== 'setup' && !fs.existsSync(databaseFile)) throw new Error('Missing database');
            try { database.openDatabase(material.subarray(0, 32)); }
            catch {
              throw safeError(state.operation === 'change'
                ? 'Password change was interrupted. Try the other password. If neither works, restore a matching backup.'
                : GENERIC_ERROR);
            }
            try { save(stable(credential)); }
            catch (err) { lock(); throw err; }
            unlocked = true; lastActivity = monotonicNow();
            return { ok: true };
          } finally { material.fill(0); }
        }
        throw safeError('Incorrect password.');
      });
    },
    async logout() {
      try { return lock(); } catch { throw safeError(GENERIC_ERROR); }
    },
    changePassword(oldValue, newValue) {
      return withOperation(async start => {
        checkInactivity();
        if (!unlocked || !database.isOpen()) throw safeError('Sign in before changing your password.');
        const password = newPassword(newValue);
        const state = readState();
        if (!state || state.operation !== null) throw new Error('Unresolved authentication state');
        reserveAttempt(state);
        const oldMaterial = await deriveKey(existingPassword(oldValue), state.current.salt);
        try {
          assertEpoch(start);
          if (!matches(oldMaterial, state.current)) throw safeError('Incorrect password.');
        } finally { oldMaterial.fill(0); }
        if (password === existingPassword(oldValue)) {
          save(stable(state.current));
          lastActivity = monotonicNow();
          return { ok: true };
        }
        const salt = randomBytes(16).toString('hex');
        const material = await deriveKey(password, salt);
        try {
          assertEpoch(start);
          const credential = { salt, check: checkValue(material).toString('hex') };
          save({ ...state, pending: credential, operation: 'change' });
          try {
            database.rekeyDatabase(material.subarray(0, 32));
            save(stable(credential));
            lastActivity = monotonicNow();
            return { ok: true };
          } catch (err) { lock(); throw err; }
        } finally { material.fill(0); }
      });
    },
  };
  return { ...api, lock, activity, checkInactivity, assertUnlocked,
    isUnlocked: () => unlocked && database.isOpen() };
}

module.exports = { createAuth, atomicWrite, IDLE_MS };
