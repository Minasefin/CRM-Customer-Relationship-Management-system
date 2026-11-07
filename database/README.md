# Database (Adrian)

Implemented in index.cjs using better-sqlite3-multiple-ciphers. Production storage is app.getPath('userData')/crm.db. No database or key belongs in this repository.

## Main-process lifecycle

- openDatabase(key): synchronous; requires a 32-byte Buffer, returns { ok: true }. Call after Electron is ready. Rejects an already-open connection, invalid keys and unknown schema versions. A failed open never replaces an existing file.
- closeDatabase(): synchronous and idempotent, returns { ok: true }.
- isOpen(): synchronous boolean.
- rekeyDatabase(newKey): synchronous; requires an open database and a 32-byte Buffer. Returns { ok: true }. Nic must coordinate salt/check-value updates with rekey success and recovery from interrupted password changes.
- createDatabase(filename): factory for isolated tests and development fixtures. Production uses the exported singleton.

The library receives key bytes through its Buffer API, never SQL interpolation. The caller owns its Buffer and must wipe it when finished. Closing releases the native connection; JavaScript cannot guarantee wiping every native/internal key copy.

There is deliberately no automatic development-key fallback. Tests generate ephemeral random keys and synthetic data in temporary directories. A development runner may supply a locally managed key, but must never ship that key or bypass login in packaged builds.

## Data operations

All domain operations are async, returning the shapes in docs/API.md. Reads include archived records so history remains resolvable; the UI filters its active lists. No domain deletion functions are exported.

Schema version 1 has eleven tables. Phone/email/child/skill lists are editable current details, replaced transactionally when supplied; omitted fields remain unchanged. Contact notes retain previous text in note_revisions. Employment moves preserve prior stints and are atomic. Same-organization moves do nothing.

Contracts use one contact and its current organization at creation (null for Independent). Associations are immutable thereafter, preserving history. Contract status and archive state are independent. Values are nonnegative safe whole-dollar integers or null. Dates normalize to ISO UTC; the UI must consistently interpret date-only inputs. Images are bounded PNG/JPEG/WebP/GIF data URLs stored inside the encrypted database.

Schema initialization only accepts empty version-zero databases. Existing unversioned schemas and future versions are rejected, never reset. Later schema changes require explicit transactional migrations.

## Integration still required

Mina and Nic should review the API proposal before wiring it. Keep the mock UI until login and the complete bridge are available. Register every action with handle() from electron/ipc.cjs and expose named functions in preload.cjs. Lifecycle/key functions stay main-process only. Do not expose createDatabase to the renderer.

Auth must close the database on logout and inactivity. Cross-platform installed Electron tests remain required; the Node tests do not prove packaged behavior.

## Verification

Run node --test database/database.test.cjs, npm run check:secrets, and npm run build.

## Version 2 (issues #40–42)
Existing encrypted v1 databases migrate transactionally on successful unlock. The migration adds optional contact name fields and organization_attachments with encrypted BLOB content; new databases start at v2. Unknown newer schemas remain refused. The v1 SQL is retained for migration regression tests.

Attachments have a 10 MiB decoded limit per file and no plaintext cache. Lists return metadata; retrieving one attachment returns base64 bytes. Archive/restore keeps all bytes. UI search/Soundex must include middleName.

Storage relocation lives in storage.cjs and electron/storage-bridge.cjs. It checkpoints and closes the DB, copies crm.db plus auth.json to an empty chosen folder, verifies hashes, then commits a location pointer and restarts. Originals remain a recovery copy. Do not treat the stale originals as current after subsequent writes or password changes.
Missing external storage fails closed. Cancel does nothing. Copy errors leave the source pair intact; sign in again to retry. Only production authenticated sessions can relocate.

Integration handoff: current main did not contain controls for these three issues at implementation time. Mina needs to connect the new named preload functions, middle-name search and display, attachment selection/archive/retrieval, and Settings location picker. These backend changes do not add src/ UI controls.

Run npm run test:db and npm run test:auth. Installed builds and external-drive unplug/reconnect should also be exercised on each target OS.

## PR #61 compatibility check (2026-11-06)
Tested against TOTP branch commit 6301969 without merging it into main.
The combined implementation passes the existing regression suites and a new optional database/totp-compat.test.cjs test. It verifies encrypted attachments and name fields survive rekey and relocation, enrollment stays enabled, old passwords and consumed recovery codes remain rejected, and authenticator replay protection survives restart.
The compatibility test skips explicitly when the TOTP implementation is absent; no TOTP code is included by this database branch.
Combining both feature branches requires preserving all auth and storage preload methods and updating the shared Electron smoke test to 35 exposed API methods (30 without TOTP). Prepared combined upload files are specific to PR #61 commit 6301969 and must be rechecked after Nic's pending fix.
This does not certify phone acceptance, Nic's outstanding issue, UI completion, or installed macOS/Linux behavior.

### Blocking security finding: PR #61 auth metadata rollback
Confirmed on 2026-11-06 against 6301969 plus our database changes: after enabling TOTP, replacing auth.json with a saved pre-enrollment copy permits password-only login. The earlier compatibility suite did not cover this attack. Do not merge/release the combined package until Nic's fix is integrated and verified.

Agreed direction: persist a 2FA-required marker inside the encrypted database. Auth must read it after internally opening the database, but before setting unlocked/exposing any CRM APIs. If the marker requires 2FA but metadata has none, close the database and reject login. Enabling/disabling must handle interruption between the two storage writes without creating a password-only bypass. Clearing the marker requires authorized factor removal.

Database coordination: our schema is already version 2. Nic's schema change must preserve our name fields, attachments and v1-to-v2 migration; add a coordinated subsequent migration instead of replacing schema.sql or reusing a conflicting schema version. Exact internal helper names remain to be agreed with Nic; no renderer setter should expose this flag.

Required new regression: save pre-enrollment auth.json, enable TOTP, lock, restore that old JSON, attempt password-only login, and require failure with database closed and domain APIs locked. Repeat after restart, password changes where applicable, and relocation. Also verify legitimate TOTP/recovery logins and authorized disable still work, including interrupted enrollment/disable.

A boolean marker addresses stripping the factor metadata or restoring a pre-enrollment auth.json while retaining the current database. It does not by itself prevent rolling back BOTH files together, or restoring older factor-enabled metadata containing unused recovery codes. Describe the protection narrowly.
