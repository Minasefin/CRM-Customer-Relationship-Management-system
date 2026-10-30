'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-auth-electron-'));
const env = { ...process.env, CRM_AUTH_TEST_DIRECTORY: directory };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(require('electron'), [path.join(__dirname, 'electron-smoke.cjs')], {
  stdio: 'inherit', windowsHide: true,
  env,
});
child.on('error', () => { console.error('Could not start Electron'); process.exitCode = 1; });
child.on('close', code => {
  // Chromium can hold its cache files until process exit, especially on Windows.
  fs.rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  process.exitCode = code === 0 ? 0 : 1;
});
