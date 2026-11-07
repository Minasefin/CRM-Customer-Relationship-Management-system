'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { scrypt, randomBytes, createHmac, timingSafeEqual } = require('node:crypto');
const { promisify } = require('node:util');
const { performance } = require('node:perf_hooks');
const { normalize, validateNewPassword } = require('./password-policy.cjs');

const totp = require('./totp.cjs');
const recovery = require('./recovery.cjs');

const scryptAsync = promisify(scrypt);
const IDLE_MS = 15 * 60 * 1000;
const MISSING_FACTOR = 'Two-step sign-in is turned on for this data, but its details are missing from this computer. Restore the matching login file (auth.json) from a backup.';
const BAD_RECOVERY_KEY = "That recovery key didn't work. Check it and try again.";
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
  return value && typeof value === 'object' && /^[a-f0-9]{32}$/.test(value.salt) && /^[a-f0-9]{64}$/.test(value.check) &&
    (value.totp === undefined || totp.validEnvelope(value.totp)) &&
    (value.recovery === undefined || recovery.validRecord(value.recovery));
}
function validateState(state) {
  if (!state || ![1, 2].includes(state.version) || !Number.isInteger(state.failures) || state.failures < 0 || state.failures > 100 ||
      !Number.isSafeInteger(state.nextAllowedAt) || state.nextAllowedAt < 0) throw new Error('Invalid auth metadata');
  const stable = state.operation === null && validCredential(state.current) && state.pending === null;
  const setup = state.operation === 'setup' && state.current === null && validCredential(state.pending);
  const change = state.operation === 'change' && validCredential(state.current) && validCredential(state.pending);
  if (state.version === 1 && (state.current?.totp || state.pending?.totp)) throw new Error('Invalid auth version');
  if (state.version === 2 && (!state.current?.totp || (state.pending && !state.pending.totp))) throw new Error('Missing second factor');
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
  let enrollment = null;
  function clearEnrollment() {
    if (enrollment) { enrollment.material.fill(0); enrollment.secret.fill(0); enrollment = null; }
  }
  function requireSession() {
    checkInactivity();
    if (!unlocked || !database.isOpen()) throw safeError('Sign in first.');
  }

  function readState() {
    if (!fs.existsSync(filename)) {
      if (fs.existsSync(databaseFile)) throw new Error('Database exists without authentication metadata');
      return null;
    }
    if (fs.statSync(filename).size > 16384) throw new Error('Invalid auth metadata');
    return validateState(JSON.parse(fs.readFileSync(filename, 'utf8')));
  }
  function save(state) { writeState(filename, validateState(state)); }
  function lock() {
    epoch++;
    clearEnrollment();
    const wasUnlocked = unlocked;
    unlocked = false;
    try { database.closeDatabase(); }
    finally { if (wasUnlocked) onLock(); }
    return { ok: true };
  }
  function checkInactivity() {
    if (enrollment && monotonicNow() >= enrollment.expires) clearEnrollment();
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
    return { version: credential.totp ? 2 : 1, current: credential, pending: null, operation: null, failures: 0, nextAllowedAt: 0 };
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
    login(value) { return api.loginWithTotp(value); },
    loginWithTotp(value, code) {
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
            // The database is open but the session is NOT unlocked yet. Whether 2FA is on comes
            // from inside the encrypted database, so editing or swapping auth.json can't turn it
            // off. Any failure below closes the database again.
            try {
              const required = database.secondFactorRequired();
              if (required && !credential.totp) throw safeError(MISSING_FACTOR);
              if (credential.totp) {
                const payload = totp.unseal(credential.totp, material);
                if (!totp.consume(payload, code, now())) throw safeError('A valid authenticator or recovery code is required.');
                credential.totp = totp.seal(payload, material);
                // Consume BEFORE unlocking: a failed write must never unlock.
                save(state);
                // Turning 2FA on writes auth.json first, then this flag; finish it if that was cut short.
                if (!required) database.setSecondFactorRequired(true);
              }
              save(stable(credential));
            } catch (err) { lock(); throw err; }
            unlocked = true; lastActivity = monotonicNow();
            return { ok: true };
          } finally { material.fill(0); }
        }
        throw safeError('Incorrect password.');
      });
    },
    async getTotpStatus() {
      try {
        const state = readState();
        return { enabled: Boolean(state?.current?.totp || state?.pending?.totp) };
      } catch { throw safeError(GENERIC_ERROR); }
    },
    beginTotpSetup(value) {
      return withOperation(async start => {
        requireSession();
        clearEnrollment();
        const state = readState();
        if (!state || state.operation !== null) throw new Error('Unresolved authentication state');
        if (state.current.totp) throw safeError('Authenticator is already enabled.');
        reserveAttempt(state);
        const material = await deriveKey(existingPassword(value), state.current.salt);
        try {
          assertEpoch(start); requireSession();
          if (!matches(material, state.current)) throw safeError('Incorrect password.');
          save(stable(state.current));
          const secret = randomBytes(20);
          enrollment = { secret, material: Buffer.from(material), credential: state.current,
            expires: monotonicNow() + 5 * 60 * 1000 };
          const encoded = totp.base32(secret);
          return { ok: true, secret: encoded,
            otpauthUri: `otpauth://totp/Auria:Local%20account?secret=${encoded}&issuer=Auria&algorithm=SHA1&digits=6&period=30` };
        } finally { material.fill(0); }
      });
    },
    confirmTotpSetup(code) {
      return withOperation(async () => {
        requireSession();
        if (!enrollment || monotonicNow() >= enrollment.expires) {
          clearEnrollment(); throw safeError('Authenticator setup expired. Start again.');
        }
        const state = readState();
        if (!state || state.operation !== null || state.current.totp || state.current.check !== enrollment.credential.check) {
          clearEnrollment(); throw new Error('Enrollment state changed');
        }
        reserveAttempt(state);
        const step = totp.matchStep(enrollment.secret, code, now());
        if (step === null) throw safeError('Incorrect authenticator code.');
        const recoveryCodes = Array.from({ length: 10 }, () => randomBytes(16).toString('hex'));
        state.current.totp = totp.seal({ secret: enrollment.secret.toString('hex'), lastStep: step,
          recovery: recoveryCodes.map(totp.hashRecovery) }, enrollment.material);
        try { save(stable(state.current)); }
        catch (err) { lock(); throw err; }
        // auth.json first, then the flag inside the database. If the flag write fails, the
        // next sign-in still asks for a code (auth.json has the 2FA data) and sets it then.
        try { database.setSecondFactorRequired(true); } catch { /* finished at next sign-in */ }
        clearEnrollment();
        return { ok: true, recoveryCodes };
      });
    },
    disableTotp(value, code) {
      return withOperation(async start => {
        requireSession();
        const state = readState();
        if (!state || state.operation !== null) throw new Error('Unresolved authentication state');
        if (!state.current.totp) throw safeError('Authenticator is not enabled.');
        reserveAttempt(state);
        const material = await deriveKey(existingPassword(value), state.current.salt);
        try {
          assertEpoch(start); requireSession();
          if (!matches(material, state.current)) throw safeError('Incorrect password.');
          const payload = totp.unseal(state.current.totp, material);
          if (!totp.consume(payload, code, now())) throw safeError('A valid authenticator or recovery code is required.');
          // Flag first, then auth.json. If saving auth.json fails after this, it still has the
          // 2FA data, so sign-in still asks for a code and turns the flag back on.
          database.setSecondFactorRequired(false);
          delete state.current.totp;
          try { save(stable(state.current)); } catch (err) { lock(); throw err; }
          clearEnrollment(); return { ok: true };
        } finally { material.fill(0); }
      });
    },
    async logout() {
      try { return lock(); } catch { throw safeError(GENERIC_ERROR); }
    },
    async getRecoveryStatus() {
      try { return { enabled: Boolean(readState()?.current?.recovery) }; }
      catch { throw safeError(GENERIC_ERROR); }
    },
    // Signed in + current password: make a new recovery key (replaces any old one). Shown once.
    createRecoveryKey(value) {
      return withOperation(async start => {
        requireSession();
        const state = readState();
        if (!state || state.operation !== null) throw new Error('Unresolved authentication state');
        reserveAttempt(state);
        const material = await deriveKey(existingPassword(value), state.current.salt);
        let kek;
        try {
          assertEpoch(start); requireSession();
          if (!matches(material, state.current)) throw safeError('Incorrect password.');
          const code = recovery.generate();
          const salt = randomBytes(16).toString('hex');
          kek = await deriveKey(code, salt);
          assertEpoch(start); requireSession();
          state.current.recovery = recovery.seal(material, kek.subarray(0, 32), salt);
          save(stable(state.current));
          lastActivity = monotonicNow();
          return { ok: true, recoveryKey: code };
        } finally { material.fill(0); kek?.fill(0); }
      });
    },
    // Forgot the password: recovery key (+ 2FA code if it's on) -> new password and a NEW
    // recovery key (the old one stops working). Same rekey steps as changePassword; the
    // session unlocks at the end. The screen reloads itself after showing the new key.
    resetPasswordWithRecoveryKey(keyValue, newValue, code) {
      return withOperation(async start => {
        if (unlocked) throw safeError('The database is already unlocked.');
        const password = newPassword(newValue);
        const state = readState();
        if (!state || state.operation === 'setup') throw safeError('Create a password first.');
        // An interrupted change keeps the old credential as `current`; the recovery key opens that one.
        const credential = state.current;
        if (!credential.recovery) throw safeError('No recovery key was made for this data, so the password can\'t be reset.');
        const typed = recovery.normalize(keyValue);
        if (!typed) throw safeError(BAD_RECOVERY_KEY);
        reserveAttempt(state);
        const kek = await deriveKey(typed, credential.recovery.salt);
        let material, next, nextKek;
        try {
          assertEpoch(start);
          try { material = recovery.openWithCode(credential.recovery, kek.subarray(0, 32)); }
          catch { throw safeError(BAD_RECOVERY_KEY); }
          if (material.length !== 64 || !matches(material, credential)) throw safeError(BAD_RECOVERY_KEY);
          if (!fs.existsSync(databaseFile)) throw new Error('Missing database');
          try { database.openDatabase(material.subarray(0, 32)); }
          catch {
            throw safeError(state.operation === 'change'
              ? 'A password change finished before this. Sign in with the new password you chose.'
              : GENERIC_ERROR);
          }
          let factor;
          try {
            // Same rule as sign-in: a recovery key is not a way around two-step sign-in.
            const required = database.secondFactorRequired();
            if (required && !credential.totp) throw safeError(MISSING_FACTOR);
            if (credential.totp) {
              factor = totp.unseal(credential.totp, material);
              if (!totp.consume(factor, code, now())) throw safeError('A valid authenticator or recovery code is required.');
              credential.totp = totp.seal(factor, material);
              save(state); // consume before going on
            }
            const salt = randomBytes(16).toString('hex');
            next = await deriveKey(password, salt);
            const newCode = recovery.generate();
            const recoverySalt = randomBytes(16).toString('hex');
            nextKek = await deriveKey(newCode, recoverySalt);
            assertEpoch(start);
            const fresh = { salt, check: checkValue(next).toString('hex') };
            if (factor) fresh.totp = totp.seal(factor, next);
            fresh.recovery = recovery.seal(next, nextKek.subarray(0, 32), recoverySalt);
            save({ ...state, current: credential, pending: fresh, operation: 'change' });
            database.rekeyDatabase(next.subarray(0, 32));
            save(stable(fresh));
            unlocked = true; lastActivity = monotonicNow();
            return { ok: true, recoveryKey: newCode };
          } catch (err) { lock(); throw err; }
        } finally { kek.fill(0); material?.fill(0); next?.fill(0); nextKek?.fill(0); }
      });
    },
    changePassword(oldValue, newValue) {
      return withOperation(async start => {
        checkInactivity();
        if (!unlocked || !database.isOpen()) throw safeError('Sign in before changing your password.');
        const password = newPassword(newValue);
        const state = readState();
        if (!state || state.operation !== null) throw new Error('Unresolved authentication state');
        reserveAttempt(state);
        let factor, recoveryKek;
        const oldMaterial = await deriveKey(existingPassword(oldValue), state.current.salt);
        try {
          assertEpoch(start);
          if (!matches(oldMaterial, state.current)) throw safeError('Incorrect password.');
          if (state.current.totp) factor = totp.unseal(state.current.totp, oldMaterial);
          // Keep the recovery key working: re-lock its copy with the new password below.
          if (state.current.recovery) recoveryKek = recovery.openWithPassword(state.current.recovery, oldMaterial);
          clearEnrollment();
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
          if (factor) credential.totp = totp.seal(factor, material);
          if (recoveryKek) credential.recovery = recovery.seal(material, recoveryKek, state.current.recovery.salt);
          save({ ...state, pending: credential, operation: 'change' });
          try {
            database.rekeyDatabase(material.subarray(0, 32));
            save(stable(credential));
            lastActivity = monotonicNow();
            return { ok: true };
          } catch (err) { lock(); throw err; }
        } finally { material.fill(0); recoveryKek?.fill(0); }
      });
    },
  };
  return { ...api, lock, activity, checkInactivity, assertUnlocked,
    isUnlocked: () => unlocked && database.isOpen() };
}

module.exports = { createAuth, atomicWrite, IDLE_MS };
