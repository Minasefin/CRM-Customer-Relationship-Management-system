# Contractor CRM

A secure, offline desktop CRM for managing military contractors and the firms that employ them. Built with Electron, React and SQLite. Runs on macOS, Windows and Linux.

Start with [`PROJECT.md`](PROJECT.md) for the requirements, scope and who owns what.

## Run it

You need [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install
npm run dev        # opens the desktop app with live reload
npm run dev:web    # UI only, in your browser at http://localhost:5173
```

The UI uses made-up test data from `src/api/mockData.js` until the database layer is connected.

## Build the installers

```bash
npm run dist   # builds the installer for the computer you're on, into release/
```

GitHub builds all three (Mac `.dmg`, Windows Setup `.exe`, Linux `.AppImage`) automatically:

- **Testing:** on a pull request that changes packaging, open the **Installers** check → **Summary** → **Artifacts** to download them.
- **Releasing:** bump `version` in `package.json`, then push a tag like `v0.1.0` (`git tag v0.1.0 && git push origin v0.1.0`). A **draft** release with all three installers appears under **Releases**. Check it and click **Publish**.

The apps aren't signed with a paid certificate, so Mac and Windows warn once on first open. `build/Read Me First.html` walks through it and ships inside the Mac installer.

## Folders

| Folder | Owner | What's in it |
| --- | --- | --- |
| `src/` | Mina | The app's screens (React) |
| `database/` | Adrian | Local encrypted SQLite database |
| `auth/` | Nic | Login, password handling, auto-lock |
| `electron/` | Shared | Opens the window and connects the UI to database and auth |
| `docs/` | Shared | The function list the three layers agree on |

## How we work

- `main` only holds working code. Nobody pushes to it directly.
- Work on your own branch and open a pull request. Someone else reviews it before it merges.
- Merge small pieces often.
- Only synthetic data goes in this repo. Database files are ignored by git on purpose.
- Run `npm run check:secrets` before committing. Pull requests run it automatically, plus a vulnerability check and a build. See [`SECURITY.md`](SECURITY.md).
