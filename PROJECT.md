# Project context

Read this first, whether you're a teammate or an AI tool helping on this repo.

## The client

Benjamin Burchfield runs a private organization that handles military contracts. His data "can never be on the web," so this is a desktop app that stores everything on his own computer. One user only: him. Contact him on Microsoft Teams and @mention him.

## Team

| Person | Owns |
| --- | --- |
| Mina | End-user platform (the UI, `src/`) |
| Adrian | Database (`database/`) |
| Nic | Authentication (`auth/`) |

## Dates

- **October 31, 2026:** Sprint 1 due (baseline app + statement of work)
- **The week after:** revision based on client feedback

## Where we stand

Update this section whenever something lands, so everyone (and their AI tools) knows what's done.

| Area | Status | Next step |
| --- | --- | --- |
| UI (Mina) | All screens done and connected to the database: contacts, profile (notes with edit, call/text, status, work history), firms, contracts with notes, Home, Statistics, Archived (people, firms, contracts), settings, sounds-like search. Save errors show in plain English. Login: create-password, sign-in and locked screens, Lock button, change password in Settings. | Polish after the client demo |
| Database (Adrian) | Encrypted SQLite built (`database/`), with tests. Connected to the app; `npm run dev:db` runs it with a test key. | Help wire the login's key into `openDatabase` |
| Auth (Nic) | Five auth functions and Electron wiring implemented with offline password screening, scrypt, persistent throttling, recoverable rekeying and 15-minute/sleep locking. Tests in `auth/`. | Mina's login/setup screens; installed cross-platform verification. See `auth/README.md` for the hand-off. |
| Shared | `docs/API.md` agreed Oct 29. Every pull request runs the app on a real encrypted database and clicks through it. | Installers must include the database module |

## What the app stores

- **Organizations** (firms) located anywhere in the world, with logos
- **Contacts** at those organizations: phones, addresses, emails, spouse, children, skill sets, photos, social media
- **Notes** on each contact, stamped with date and time. "Last contacted" is the newest note.
- **Employment history** when a contact moves from one organization to another
- **Contracts:** value, location, on contract or available
- **Status:** Active, Left/Inactive, or Deceased. **Nothing is ever deleted**, only archived.

## Requirements

Must = Sprint 1 (Oct 31). Should = the revision week. Could = only if time allows.

| ID | Requirement | Priority |
| --- | --- | --- |
| R1 | Create, edit and view organizations | Must |
| R2 | Create, edit and view contacts linked to an organization | Must |
| R3 | Timestamped notes on a contact | Must |
| R4 | Active / Left / Deceased status; never delete | Must |
| R5 | Password login following NIST guidance | Must |
| R6 | All data local and encrypted; no internet needed | Must |
| R7 | Runs on macOS, Windows and Linux | Must |
| R8 | Light and dark mode, readable text | Must |
| R9 | Move a contact to a new org and keep the history | Should |
| R10 | Contract details | Should |
| R11 | Search by skill across all orgs | Should |
| R12 | Everyone at a chosen org | Should |
| R13 | Contacts not reached in X days | Should |
| R14 | Contact activity stats vs. previous quarter/year | Should |
| R15 | Contact photos | Should |
| R16 | Social media handles | Should |
| R17 | Click a phone number to call or text | Could |
| R18 | Trends in how contacts move between orgs | Could |

**Out of scope:** web/cloud/mobile versions, integrations, biometric login, voice dictation, maps, multiple users.

## UI decisions (Mina)

- Sidebar: Home, Contacts, Organizations, Contracts, Statistics, Archived, then Settings
- Home answers "what do I do today?": who to call, active contracts and ones ending soon, latest notes, quick note
- Contacts is a grid of contact cards with search, filters and a sort dropdown (Recently added is a sort option, not a tab)
- Every card and row has the same ⋯ menu. Firms: Edit, Archive, Delete (only when nothing points to them). Contacts: Edit, Mark left / deceased / active, never delete. Contracts: Edit, Delete with confirm
- Organizations, Contacts and Contracts each have a Sort by dropdown
- **Soundex name matching** (professor's suggestion): contact search also shows "names that sound like" what was typed ("Smyth" finds Smith), in a separate labeled section, and Add contact warns when a new name sounds like an existing contact. Code in `src/lib/soundex.js`. Soundex is fuzzy by design (Hale and Holloway share a code), so sound-alikes are never mixed into exact results.
- Each card shows "Last contacted" with a colored ring around the photo: green under 30 days, yellow 30–90, red over 90. Thresholds are editable in Settings.
- Archived and deceased people are hidden from the main grid and live under Archived
- Light/dark mode switches by time of day (7 AM–7 PM light by default). Can be turned off in Settings.
- Light blue accent for toggles and buttons; clean, friendly, professional
- **Button order everywhere: the blue main action first, then Cancel**
- Forms open as a panel that slides in from the right
- A contact with no firm is "Independent" (`orgId: null`), never a fake "N/A" organization
- Changing a contact's organization asks "Is X moving to Y?" and saves the old one to work history (`moveContact`)
- Clicking Light/Dark mode in the sidebar switches it until the next scheduled change

## How the layers connect

The UI never touches the database or auth code directly. It calls the functions in [`docs/API.md`](docs/API.md) through `window.crm.api`, which `electron/preload.cjs` exposes once the main process has opened the database (`electron/database-bridge.cjs`). Without a database the UI uses sample data with the same shapes.

```
UI (src/)  →  window.crm.api  →  electron/main.cjs  →  database/ and auth/
```

**Auth and database are linked:** the database is encrypted with a key derived from the user's password. Adrian and Nic need to agree on how that works early.
