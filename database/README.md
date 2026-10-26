# Database (Adrian)

Local SQLite database, encrypted on disk. Nothing leaves the computer.

## Suggested starting point

- [`better-sqlite3-multiple-ciphers`](https://www.npmjs.com/package/better-sqlite3-multiple-ciphers): SQLite with built-in encryption (SQLCipher-compatible)
- Store the database file in Electron's user data folder (`app.getPath('userData')`), never inside the repo
- Implement the Organizations, Contacts and Contracts functions in [`../docs/API.md`](../docs/API.md)
- Register them in `electron/main.cjs` with `ipcMain.handle('db:getContacts', ...)` and expose them in `electron/preload.cjs`

`schema.sql` is a first draft that matches the UI's mock data. Change it freely, but update `docs/API.md` and tell Mina when the shapes change.

## Coordinate with Nic

The encryption key should come from the user's password (Nic's login). Agree on who derives the key and how it's passed to the database before either of you builds that part.
