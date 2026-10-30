# Authentication (Nic)

One user, one password, fully offline. Implement the Auth functions in [`../docs/API.md`](../docs/API.md).

## Suggested starting point

- Follow NIST SP 800-63B-4 for passwords. A password-only login is single-factor, so the minimum is **15 characters** (8 only if you add a second factor). Accept at least 64 characters and any characters including spaces. No forced complexity rules, scheduled resets, hints or security questions. Reject common and breached passwords and say why. Allow pasting, and offer a "show password" option.
- Never store the password. Derive a key from it with Node's built-in `crypto.scrypt` (no extra dependency) and a random salt
- That derived key is what unlocks Adrian's encrypted database, so agree with him on the hand-off early
- Lock the app after a period of inactivity (the client leaves his laptop around). There's a placeholder for this in Settings.
- Register functions through `handle()` from `electron/ipc.cjs` and expose them in `electron/preload.cjs`

Mina will build the login and first-time setup screens against these functions.

## Implementation and UI hand-off

`index.cjs` implements all five existing functions without changing `docs/API.md`.
`electron/auth-bridge.cjs` registers them through the safe `handle()` wrapper from
`electron/ipc.cjs` (use that wrapper, not raw `ipcMain.handle`). No key or database
lifecycle operation is exposed to the renderer.

- `window.crm.api` always contains the five auth functions and 19 data functions.
  Calls to data functions are rejected while locked. `window.crm.dataMode` is
  `database` after password authentication, `dev-database` for the separate test
  database, or `sample` while locked. Auth is disabled in test-key mode.
- Successful setup/login reloads the renderer to switch from samples to encrypted
  data. Logout, inactivity, sleep and OS screen locking clear the page and reload
  it so previously loaded contact data does not remain on screen or in UI state.
  Each reload gets a fresh `dataMode` from the main process.
- Until Mina adds screens, the locked desktop and browser demo display synthetic
  sample data. This backend PR does **not** provide a usable login form. Mina can
  show setup/login when `dataMode === 'sample'`, use `isSetUp()` to choose which,
  and use the ordinary CRM when `dataMode === 'database'`. The browser demo has no
  `window.crm`. Do not gate the `dev-database` test UI behind login.
- Setup validation errors reject with a safe message, preserving `{ ok }` on
  success. Login/changePassword return `{ ok: false, error }` for failed attempts.
  Metadata/I/O failures never fall back to an unlocked database.
- Forms must allow paste, offer show/hide password, clear submitted values, and
  display the backend's error. No password hints, security questions or recovery
  backdoor. A forgotten password cannot decrypt the data.

## Passwords, storage and recovery

Passwords are NFC-normalized, counted as Unicode code points, and accept 15–128
characters including spaces. Spaces and case are preserved for authentication.
No composition rules or scheduled password changes apply. New passwords are
checked against an offline blocklist (case-insensitive whole-password matching)
and a small set of predictable contextual phrases/repeated characters.

The main process uses asynchronous Node `crypto.scrypt`, N=131072, r=8, p=1,
maxmem=192 MiB, with a fresh random 16-byte salt. Its 64-byte output is split into
a 32-byte database key and a separate verifier key. The check value is HMAC-SHA256
over a fixed, versioned label with the verifier key; comparison is constant-time.
Transient byte buffers are wiped, including on failures. JavaScript password
strings, IPC copies and native library internals cannot be reliably zeroized.
The auth module retains no key buffer between requests; closing the database
releases the native connection.

`userData/auth.json` stores versioned salts/checks and retry counters, never the
password or encryption key. Files use restrictive creation modes where supported
and inherit the OS user's ACLs on Windows. Back up `auth.json` and `crm.db`
**together while the application is closed**. Restore them together. Do not delete
auth metadata to reset a password: an existing database without metadata fails
closed. Missing or malformed files are not silently replaced.

Wrong guesses wait 1, 2, 4, 8, 16, 32, then 60 seconds between attempts. The
counter/deadline is saved before derivation and survives app restart. Correct
authentication clears it. Only one password operation runs at a time; concurrent
requests are refused rather than queued. Local administrators can alter files or
the clock and bypass this online throttle; scrypt protects offline guesses.

Setup saves a pending salt/check before database creation. Password changes save
both old and pending new salt/check values before calling `rekeyDatabase`. Only
after success is the pending record promoted. Atomic temporary-file replacement
and fsync protect JSON writes. On interruption, login derives the entered
password's candidate key and opens the real database before choosing the surviving
credential. If a password change was interrupted, try the new password first,
then the old one after the displayed delay. Neither case resets/deletes records.
This handles interruptions between completed database operations and metadata
writes; it cannot repair damaged database files or guarantee storage hardware's
power-loss behavior. Keep matching backups.

## Session locking

The timeout is fixed at **15 minutes of application inactivity**, checked every
second and before each data operation. Native keyboard/mouse input refreshes it;
background API polling does not. Late input cannot revive an expired session.
Sleep and supported OS screen-lock events lock immediately. Logout/lock during
an asynchronous derivation cancels that operation before it can open or rekey the
database. Renderer exit/crash and application quit close the connection too.
No Settings timeout control is wired yet.

## Offline blocklist provenance

`blocked-passwords.sha256` contains 10,898 unique SHA-256 hashes of NFC-normalized,
lowercased entries of length 15–128 from SecLists'
[`xato-net-10-million-passwords-1000000.txt`](https://github.com/danielmiessler/SecLists/blob/master/Passwords/Common-Credentials/xato-net-10-million-passwords-1000000.txt),
retrieved October 30, 2026. Source SHA-256:
`424a3e03a17df0a2bc2b3ca749d81b04e79d59cb7aeec8876a5a3f308d0caf51`.
The source's MIT license is included in `BLOCKLIST-LICENSE.txt`. These are public
blocklist digests, not account verifiers; no plaintext breach list is bundled.
Shorter entries are already refused by the length rule. Refresh the bundled
artifact during maintenance; no finite offline list catches all breached
passwords. The application never downloads a list or transmits a password.

Password-policy reference: [NIST SP 800-63B-4, section 3.1.1](https://pages.nist.gov/800-63-4/sp800-63b.html#password).
This implementation follows the project's password requirements; it is not a
claim of certification for the entire application.

## Verification

```
npm run test:auth
npm run test:db
npm run build
npm run test:auth:electron
npm run check:secrets
```

The auth suite uses real encrypted SQLite files and production scrypt for the
full lifecycle; race/fault tests inject a faster derivation and controlled clocks.
The Electron test uses the actual main process, preload and UI with a temporary
synthetic database. It checks setup/login/rekey/logout, sample-mode switching,
locked IPC, sleep and screen lock. CI runs both suites. Installed macOS/Linux/
Windows builds still need packaging verification.
