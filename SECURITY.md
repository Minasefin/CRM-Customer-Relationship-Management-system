# Security

This app holds sensitive information about military contractors on one person's computer. This page covers what's already locked down, the rules everyone follows, and what Adrian and Nic need to get right in their parts.

## Short version

- **There are no API keys or passwords in this code, and there never should be.** The app is offline and talks to no services, so it doesn't need any. The whole git history was scanned on Oct 26, 2026 and is clean.
- **Before every commit:** `npm run check:secrets`. Every pull request also runs it automatically, along with a vulnerability check and a build.
- **Never commit** `.env` files, database files (`*.db`, `*.sqlite`), keys, or real data. `.gitignore` blocks the common ones.

## What's already locked down

Checked against the real Electron app on Oct 26, 2026:

| Protection | What it stops | Where |
| --- | --- | --- |
| Sandbox, context isolation, no Node in the page | Page code can't touch files or run programs | `electron/main.cjs` |
| Only the app's own pages can load | Window can't be navigated or redirected to a website | `will-navigate`, `will-redirect` |
| No pop-up windows or embedded web views | A link can't open a hidden browser inside the app | `setWindowOpenHandler`, `will-attach-webview` |
| All network requests blocked except the app's own files | No data can be sent out, even by a bad package | `webRequest.onBeforeRequest` |
| Content Security Policy on the built app | Injected or outside scripts can't run | `vite.config.mjs` |
| Dev server address ignored in the installed app, local only in dev | Nobody can point the installed app at their own site via `VITE_DEV_SERVER_URL` | `electron/ipc.cjs` |
| Camera, mic, location and other permissions always denied | | `setPermissionRequestHandler` |
| Dev tools off in the installed app; no source maps | Harder to poke at the running app | `main.cjs`, `vite.config.mjs` |
| Spellcheck off | Some systems send typed words to an online spellcheck service | `main.cjs` |
| Packages up to date, 0 known vulnerabilities | Electron 44, Vite 7 | `package.json` |
| Dependabot | Opens a pull request when a package gets a security fix | `.github/dependabot.yml` |

## Rules for connecting the database and login (Adrian, Nic)

1. **Use `handle()` from `electron/ipc.cjs`** to register every function. It refuses calls that don't come from the app and hides internal errors (file paths, SQL) from the page.
2. **In `preload.cjs`, expose one named function per action.** Never expose `ipcRenderer`, `require`, or a "send anything" function.
3. **Treat everything from the page as untrusted.** Check types and lengths, and use parameterized SQL (`db.prepare('... WHERE id = ?').get(id)`), never string-building.
4. **Never log passwords, keys, or contact data** to the console or a file.

## Login and encryption (Nic, with Adrian)

- The password is never stored. Derive the database key from it with `crypto.scrypt` and a random 16-byte salt. Store only the salt and a separate check value.
- Follow NIST SP 800-63B-4: at least 15 characters for a password-only login, allow up to 64+, no forced complexity rules or resets, block common passwords. See `auth/README.md`.
- Limit wrong guesses: wait longer after each failure (for example 1s, 2s, 4s…).
- Keep the key in the main process only, never send it to the page. Clear it on logout and auto-lock.
- Auto-lock after inactivity; the client leaves his laptop unattended.

## Database (Adrian)

- Encrypted on disk (`better-sqlite3-multiple-ciphers`), stored in `app.getPath('userData')`, never in the project folder.
- No delete functions for contacts, as designed.
- If the client wants Social Security numbers stored, that field needs extra care: show it masked, and only reveal on request. Ask him first.

## Installed app (packaging)

- Electron "fuses" are set in `electron-builder.yml`: the installed app can't be run as plain Node, ignores debug flags and `NODE_OPTIONS`, only loads its own packaged code, and checks that code hasn't been tampered with. Verified on the Linux build on Oct 28, 2026.
- The installed app ignores `VITE_DEV_SERVER_URL` and loads only its built-in files (verified on the packaged build).
- Not signed with a paid certificate (Mac is ad-hoc signed so it runs on Apple Silicon). Users see a one-time warning; `build/Read Me First.html` explains it.
- Always test by **downloading** the installer from GitHub, the way the client will. The warning only appears on downloaded files.

## Found a problem?

Don't post details in a public place. Message the team on Teams and fix it in a pull request.
