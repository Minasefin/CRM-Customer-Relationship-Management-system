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
