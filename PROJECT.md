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
| UI (Mina) | App shell, sidebar, contact grid, settings, auto light/dark, contact profile (notes, add note, call/text, status changes) done with mock data | Add/edit forms for contacts and orgs, login screens |
| Database (Adrian) | Draft schema in `database/schema.sql`; nothing built yet | Review `docs/API.md`, set up encrypted SQLite, implement Organizations/Contacts/Contracts functions |
| Auth (Nic) | Notes in `auth/README.md`; nothing built yet | Review `docs/API.md`, agree on key hand-off with Adrian, implement Auth functions |
| Shared | `docs/API.md` is a draft | All three agree on it, then build against it |

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

- Sidebar: Contacts, Recently added, Organizations, Contracts, Archived, Settings
- Main page is a grid of contact cards
- Each card shows "Last contacted" with a colored ring around the photo: green under 30 days, yellow 30–90, red over 90. Thresholds are editable in Settings.
- Archived and deceased people are hidden from the main grid and live under Archived
- Light/dark mode switches by time of day (7 AM–7 PM light by default). Can be turned off in Settings.
- Light blue accent for toggles and buttons; clean, friendly, professional

## How the layers connect

The UI never touches the database or auth code directly. It calls the functions in [`docs/API.md`](docs/API.md) through `window.crm.api`, which `electron/preload.cjs` exposes. Until those exist, the UI uses mock data.

```
UI (src/)  →  window.crm.api  →  electron/main.cjs  →  database/ and auth/
```

**Auth and database are linked:** the database is encrypted with a key derived from the user's password. Adrian and Nic need to agree on how that works early.
