# Instructions for AI coding tools

Codex, Cursor, Copilot and most AI coding tools read this file automatically. Claude Code reads `CLAUDE.md`, which points here.

## Read first

1. [`PROJECT.md`](PROJECT.md): client, requirements, scope, who owns what, current status
2. [`docs/API.md`](docs/API.md): the functions that connect the UI, database and auth. This is the contract between teammates.

## Ask which part the person owns

Three people each own one layer. Before writing code, confirm which one you're helping with, and stay inside it.

| Owner | Folder | Don't touch without asking |
| --- | --- | --- |
| Mina | `src/` (UI) | `database/`, `auth/` |
| Adrian | `database/` | `src/`, `auth/` |
| Nic | `auth/` | `src/`, `database/` |

`electron/main.cjs` and `electron/preload.cjs` are shared. Keep changes there small and add to them rather than rewriting them.

## Rules

- **Never change a function name or data shape in `docs/API.md` on your own.** Other people's code depends on it. Propose the change and update `docs/API.md` in the same pull request so teammates see it.
- **The app is offline.** No network calls, no cloud services, no CDNs, no analytics. Fonts and icons are bundled.
- **Never delete records.** Contacts are archived through `status` (`active`, `inactive`, `deceased`).
- **Only synthetic data.** Never add real names or data. Never commit database files, passwords or keys.
- **Must work on macOS, Windows and Linux.** Avoid OS-specific paths and shell commands.
- **Work on a branch** and open a pull request. Never push to `main`.
- Keep the UI working with mock data (`src/api/mockData.js`) until the real layer is wired in through `window.crm.api`.

## Commands

```bash
npm install
npm run dev       # desktop app
npm run dev:web   # UI only in the browser
npm run build     # check it compiles
```
