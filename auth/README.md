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

`index.cjs` implements the five original functions and five optional TOTP functions documented in `docs/API.md`.
`electron/auth-bridge.cjs` registers them through the safe `handle()` wrapper from
`electron/ipc.cjs` (use that wrapper, not raw `ipcMain.handle`). No key or database
lifecycle operation is exposed to the renderer.

- `window.crm.api` always contains the ten auth functions and 19 data functions.
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
Outside pending TOTP enrollment, the auth module retains no key buffer between requests; closing the database
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

## Optional TOTP and Microsoft Authenticator

Enrollment is optional. Once confirmed, password-only login cannot open the database.
The backend uses RFC 6238 TOTP (SHA-1, six digits, 30 seconds) and an `otpauth://`
provisioning URI compatible with Microsoft Authenticator's **Other account** option.
All generation and verification are local using Node crypto; no package, Microsoft
API, account login, cloud service, or network request is required by this app.
The existing 15-character password minimum remains in place.

`totp.cjs` verifies the current and adjacent 30-second steps. An accepted step and
all older steps are refused thereafter. Enrollment confirmation also consumes its
step, so wait for a fresh code before signing in. Ten independently random 128-bit
recovery codes are returned only on confirmation. Only their SHA-256 digests are
stored; each is consumed once. Both factor attempts and password guesses share the
persistent throttle. Consumption is saved before opening the database. A failed
login after consumption may burn a code; it never unlocks without persistence.

The secret, recovery digests, and last accepted step are AES-256-GCM encrypted under
the password-derived verifier half, using a fresh nonce and fixed versioned AAD.
Each credential carries its own encrypted payload so interrupted password rekeys
retain a usable second factor under either surviving password. Enrolled metadata
uses version 2 so older builds refuse it instead of ignoring the second factor.
Existing version 1 accounts work without migration until enrollment.

Pending enrollment retains a secret and derived-material buffer in main-process
memory for at most five minutes, cleared by the existing periodic inactivity check,
confirmation, a replacement setup, password change, or lock. Buffers are wiped;
JavaScript strings and IPC copies cannot be reliably erased. The URI, manual secret,
and recovery codes are sensitive and must not be logged or sent to a QR website.

This is application-level two-factor access control. Because the database key is
still password-derived, TOTP does not add cryptographic protection against someone
who knows the password and can modify the program/authentication files or open the
database directly. Restoring old matching backups can also restore consumed codes.
Keep backups protected; recovery codes cannot recover a forgotten password.

### Why editing auth.json can't turn 2FA off

`auth.json` is not encrypted or signed, so on its own it can't be trusted to say whether 2FA is on: deleting its `totp` part, or putting back a copy from before 2FA was enrolled, used to let the password alone sign in. So the encrypted database also keeps a "2FA required" flag (database version 4, table `app_meta`, main process only; the screens can't reach it).

- **Sign-in:** the password opens the database but does not unlock the session. If the database says 2FA is required and `auth.json` has no 2FA data, sign-in is refused and the database is closed again. Otherwise a valid code is required as before, and only then is the session unlocked.
- **Turning 2FA on:** `auth.json` is saved first, then the flag. If the flag write fails, the next sign-in still asks for a code (auth.json has the 2FA data) and sets the flag.
- **Turning 2FA off:** the flag is cleared first, then `auth.json`. If saving `auth.json` fails, it still has the 2FA data, so sign-in still asks for a code and turns the flag back on.

Limits, stated plainly: putting back old copies of **both** files together (database and auth.json) can't be detected, and anyone with the password and the files can open the database with their own tools. Offline 2FA is a lock on the app's door, not part of the encryption key. Tests: `2FA cannot be switched off by editing or swapping auth.json` in `auth/auth.test.cjs`.

### Automated verification versus phone acceptance

`npm run test:auth` runs without a UI or phone. It checks the published RFC 6238
SHA-1 vectors and an independent authenticator-side implementation that parses our
provisioning URI, plus real encrypted SQLite and production scrypt lifecycle tests.
It covers enrollment, replay, recovery reuse across restart, rekey, interrupted
rekey, expiry, throttling, and corrupt metadata/write failures.
`npm run test:auth:electron` additionally exercises the real named IPC/preload
functions, enrollment, recovery login, and renderer reloads, without adding UI.
These are protocol/integration tests, not automated tests of Microsoft's phone app.

Manual acceptance with a disposable synthetic account (after the UI team adds the
forms):

1. Set a password, sign in, and begin authenticator enrollment.
2. In Microsoft Authenticator choose Other account and scan the locally rendered
   QR, or enter the returned secret manually. Confirm using the displayed code.
3. Save the recovery codes privately. Log out, wait for a fresh phone code, and
   sign in with password + code. Verify a wrong or reused code is refused.
4. Restart and sign in with a recovery code. Restart again and verify reuse fails.
5. Change the password, log out, and verify the phone still works with the new one.
6. Disable using the current password plus a fresh code; verify password-only
   login works. Repeat on installed Windows, macOS and Linux builds.

The Microsoft Authenticator phone acceptance check has not been performed here.

### Interactive phone test without the application

Run from the repository root:

```sh
node auth/phone-test.cjs
```

No Electron or UI is launched. The script creates a disposable encrypted database
in the OS temporary directory and supplies a random synthetic password internally.
It never reads or changes the real application's account or database.

On your phone, open Microsoft Authenticator, add **Other account**, and select
**Enter code manually**. Use `Auria disposable phone test` as the account name and
the displayed secret as the key. Choose time-based if prompted. No QR library or
online QR generator is required. See [Microsoft's account setup guidance](https://support.microsoft.com/en-us/authenticator/how-to-add-your-accounts-to-microsoft-authenticator).

- Enter `C`, then the six-digit phone code to confirm enrollment. Save the displayed
  disposable recovery codes if you want to test recovery.
- Enter `O` to log out, then `P` to verify password-only login is refused.
- Wait for any displayed retry delay and for a **new** phone code, then enter `L`
  and that code. Successful verification prints `OK` and `Session: unlocked`.
- Enter `R` to recreate the backend from its temporary files, then `L` with a
  recovery code. Repeat `R`/`L` with that same recovery code to verify reuse fails.
- While signed in, use `D` with a fresh phone or unused recovery code to disable
  TOTP. Then `O` and `P` should allow password-only login.
- `S` shows status; `E` replaces expired/unconfirmed enrollment (update the phone's
  key too); `Q` exits. If the session locks after inactivity, use `P` before
  confirmed enrollment, or `L` after enrollment, to sign in again.

Codes typed into this disposable tester are visible in the terminal. Do not enter
real credentials or share its terminal output. Each run uses a new secret. Normal
exit, Ctrl+C and terminal EOF clean up temporary files. A forced process kill or
power loss can leave an `auria-phone-test-*` directory in the OS temp folder.
Remove the disposable account from your phone after testing. Phone and computer
clocks should use automatic time. This script verifies the real backend with your
phone; it does not test UI forms or cross-platform installer packaging.
