#!/usr/bin/env node
// Runs the app against a real encrypted test database (instead of sample data).
//
//   npm run dev:db              start the app with the test database
//   npm run dev:db -- --reset   wipe the test database and start fresh with sample people
//
// The first run creates .dev-key: a random key that only exists on your computer.
// It is gitignored and blocked by the secret scan. Don't share it or commit it.
// The installed app ignores this completely; real users will unlock with Nic's login.
import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawnSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const KEY_FILE = '.dev-key';
const reset = process.argv.includes('--reset');

if (!existsSync(KEY_FILE)) {
  writeFileSync(KEY_FILE, randomBytes(32).toString('hex') + '\n', { mode: 0o600 });
  console.log('Created .dev-key (test-only key, stays on this computer).');
}
const key = readFileSync(KEY_FILE, 'utf8').trim();

// The encrypted database is a compiled module. It has to be built for Electron
// (not plain Node) once per Electron version. Skips itself when already done.
// The marker records the Electron version plus the compiled file's timestamp, so if
// anything rebuilds it for plain Node (npm install, npm run test:db setup), it gets redone.
const marker = 'node_modules/.cache/crm-electron-native';
const electronVersion = require('electron/package.json').version;
const nativeFile = 'node_modules/better-sqlite3-multiple-ciphers/build/Release/better_sqlite3.node';
const stamp = () => `${electronVersion} ${existsSync(nativeFile) ? statSync(nativeFile).mtimeMs : 'none'}`;
const builtFor = existsSync(marker) ? readFileSync(marker, 'utf8').trim() : '';
if (builtFor !== stamp()) {
  console.log(`Building the database module for Electron ${electronVersion} (first time only, takes a minute)...`);
  const r = spawnSync('npx', ['electron-rebuild', '--force', '--only', 'better-sqlite3-multiple-ciphers'], { stdio: 'inherit', shell: true });
  if (r.status !== 0) {
    console.error('\nCould not build the database module. On Windows, install "Desktop development with C++"');
    console.error('from Visual Studio Build Tools. On Mac, run: xcode-select --install');
    process.exit(r.status || 1);
  }
  mkdirSync('node_modules/.cache', { recursive: true });
  writeFileSync(marker, stamp());
}

const child = spawn('npm', ['run', 'dev'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, CRM_DEV_KEY: key, CRM_DEV_RESET: reset ? '1' : '' },
});
child.on('exit', (code) => process.exit(code ?? 0));
