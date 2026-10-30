#!/usr/bin/env node
// Runs the app against a real encrypted test database (instead of sample data).
//
//   npm run dev:db              start the app with the test database
//   npm run dev:db -- --reset   wipe the test database and start fresh with sample people
//
// The first run creates .dev-key: a random key that only exists on your computer.
// It is gitignored and blocked by the secret scan. Don't share it or commit it.
// The installed app ignores this completely; real users will unlock with Nic's login.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';

const KEY_FILE = '.dev-key';
const reset = process.argv.includes('--reset');

if (!existsSync(KEY_FILE)) {
  writeFileSync(KEY_FILE, randomBytes(32).toString('hex') + '\n', { mode: 0o600 });
  console.log('Created .dev-key (test-only key, stays on this computer).');
}
const key = readFileSync(KEY_FILE, 'utf8').trim();

const child = spawn('npm', ['run', 'dev'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, CRM_DEV_KEY: key, CRM_DEV_RESET: reset ? '1' : '' },
});
child.on('exit', (code) => process.exit(code ?? 0));
