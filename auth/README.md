# Authentication (Nic)

One user, one password, fully offline. Implement the Auth functions in [`../docs/API.md`](../docs/API.md).

## Suggested starting point

- Follow NIST SP 800-63B-4 for passwords. A password-only login is single-factor, so the minimum is **15 characters** (8 only if you add a second factor). Accept at least 64 characters and any characters including spaces. No forced complexity rules, scheduled resets, hints or security questions. Reject common and breached passwords and say why. Allow pasting, and offer a "show password" option.
- Never store the password. Derive a key from it with Node's built-in `crypto.scrypt` (no extra dependency) and a random salt
- That derived key is what unlocks Adrian's encrypted database, so agree with him on the hand-off early
- Lock the app after a period of inactivity (the client leaves his laptop around). There's a placeholder for this in Settings.
- Register the functions in `electron/main.cjs` with `ipcMain.handle('auth:login', ...)` and expose them in `electron/preload.cjs`

Mina will build the login and first-time setup screens against these functions.
