'use strict';
// Disposable, offline phone acceptance harness. Never reads the real app's userData.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const readline = require('node:readline/promises');
const { createDatabase } = require('../database/index.cjs');
const { createAuth } = require('./index.cjs');

async function run({ ask, show }) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'auria-phone-test-'));
  const database = createDatabase(path.join(directory, 'crm.db'));
  let password = `Synthetic phone test ${randomBytes(24).toString('hex')}`;
  let auth = createAuth({ database, directory });
  const timer = setInterval(() => auth.checkInactivity(), 1000);
  timer.unref();
  const prompt = async text => {
    auth.activity();
    const answer = await ask(text);
    auth.activity();
    return answer.trim();
  };
  const report = result => show(result.ok ? 'OK' : `REFUSED: ${result.error}`);
  async function enroll() {
    const result = await auth.beginTotpSetup(password);
    if (!result.ok) return report(result);
    show('\nOn your phone: Microsoft Authenticator > + > Other account > Enter code manually.');
    show('Account name: Auria disposable phone test');
    show(`Secret key: ${result.secret}`);
    show('Choose time-based if asked. Setup expires in five minutes.');
    show('Use C below to confirm the six-digit phone code. E starts a replacement setup.');
  }
  try {
    show('Auria disposable backend test — no Electron, UI, or network calls.');
    show('A random test password is supplied internally; do not enter your real password.');
    show('Only disposable setup/recovery codes are displayed. Input is visible in this terminal.');
    show('Q or Ctrl+C removes the temporary database. Remove the test account from your phone afterward.');
    await auth.setUpPassword(password);
    await enroll();
    for (;;) {
      show('\nC confirm enrollment | L login with phone/recovery code | P password-only login');
      show('O logout | R restart backend (locks it) | D disable TOTP | E begin enrollment | S status | Q quit');
      const command = (await prompt('Action: ')).toLowerCase();
      try {
        if (command === 'q') break;
        if (command === 'e') await enroll();
        else if (command === 'c') {
          const result = await auth.confirmTotpSetup(await prompt('Phone code: '));
          report(result);
          if (result.ok) {
            show('Disposable recovery codes (shown once; each replaces one phone code):');
            result.recoveryCodes.forEach(code => show(code));
            show('Now use O to log out. Wait for a NEW phone code, then L to log in.');
          }
        } else if (command === 'l') {
          report(await auth.loginWithTotp(password, await prompt('Phone or recovery code: ')));
        } else if (command === 'p') report(await auth.login(password));
        else if (command === 'o') report(await auth.logout());
        else if (command === 'r') {
          auth.lock();
          auth = createAuth({ database, directory });
          show('Backend recreated from the same temporary files; session is locked.');
        } else if (command === 'd') {
          report(await auth.disableTotp(password, await prompt('Fresh phone or unused recovery code: ')));
        } else if (command !== 's') show('Unknown action. Choose a letter from the menu.');
        const status = await auth.getTotpStatus();
        show(`TOTP: ${status.enabled ? 'enabled' : 'disabled'} | Session: ${auth.isUnlocked() ? 'unlocked' : 'locked'}`);
      } catch (err) {
        if (err.code === 'ABORT_ERR' || err.code === 'ERR_USE_AFTER_CLOSE') throw err;
        show(err.userMessage || 'Operation failed. Quit and start a fresh disposable test.');
      }
    }
  } finally {
    clearInterval(timer);
    password = undefined;
    try { auth.lock(); }
    finally {
      // Only the exact directory created above can be removed; no user-supplied path.
      const target = path.resolve(directory);
      if (path.dirname(target) !== path.resolve(os.tmpdir()) || !path.basename(target).startsWith('auria-phone-test-')) {
        throw new Error('Unexpected temporary directory');
      }
      fs.rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      show('Temporary test files removed. Remove the disposable account from your phone.');
    }
  }
}

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const controller = new AbortController();
  const cancel = () => controller.abort();
  rl.on('SIGINT', cancel);
  rl.on('close', cancel);
  process.on('SIGINT', cancel);
  process.on('SIGTERM', cancel);
  try {
    await run({ ask: text => rl.question(text, { signal: controller.signal }), show: text => console.log(text) });
  } catch (err) {
    if (err.code !== 'ABORT_ERR' && err.code !== 'ERR_USE_AFTER_CLOSE') {
      console.error('Phone test failed. No real application account was accessed.');
      process.exitCode = 1;
    }
  } finally {
    rl.close();
    process.removeListener('SIGINT', cancel);
    process.removeListener('SIGTERM', cancel);
  }
}
if (require.main === module) main();
module.exports = { run };
