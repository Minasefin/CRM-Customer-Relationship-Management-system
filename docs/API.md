# Function contract

These are the functions the UI calls. Adrian (database) and Nic (auth) implement them; Mina's UI calls them through `window.crm.api`. **Agreed Oct 29 (Adrian's changes below are approved and the UI uses them). Change it together, in a pull request.**

All functions are async and return plain objects. Dates are ISO strings (`2026-10-26T14:30:00.000Z`).

## Auth (Nic)

| Function | Returns | Notes |
| --- | --- | --- |
| `isSetUp()` | `boolean` | False on first launch, so the UI shows "create a password" |
| `setUpPassword(password)` | `{ ok }` | First launch only. Also creates the encrypted database. |
| `login(password)` | `{ ok, error? }` | Unlocks the database for this session |
| `logout()` | `{ ok }` | Locks the database; UI returns to the login screen |
| `changePassword(oldPassword, newPassword)` | `{ ok, error? }` | Re-keys the database |

## Organizations (Adrian)

| Function | Returns |
| --- | --- |
| `getOrganizations()` | `Organization[]` |
| `getOrganization(id)` | `Organization` |
| `createOrganization(data)` | `Organization` |
| `updateOrganization(id, data)` | `Organization` |
| `archiveOrganization(id, archived)` | `Organization` |


## Contacts (Adrian)

| Function | Returns | Notes |
| --- | --- | --- |
| `getContacts()` | `Contact[]` | Includes `notes`, so "last contacted" can be worked out |
| `getContact(id)` | `Contact` | |
| `createContact(data)` | `Contact` | Also starts their employment history if `orgId` is set |
| `updateContact(id, data)` | `Contact` | Ignores `orgId`, `status`, `notes`, `createdAt`. Use the functions below for those. |
| `setContactStatus(id, status)` | `Contact` | `'active' \| 'inactive' \| 'deceased'`. No delete function on purpose. |
| `moveContact(id, newOrgId)` | `Contact` | Ends the current employment row and starts a new one. `newOrgId` can be `null` (going independent). |
| `getEmploymentHistory(contactId)` | `Employment[]` | |
| `getAllEmployment()` | `Employment[]` | Everyone's work history, for the Statistics page and firm pages |
| `addNote(contactId, text)` | `Note` | Timestamp set by the database. Empty text is refused. |
| `updateNote(noteId, text)` | `Note` | Fixes the wording. Keeps the original date; the old text is kept internally. |

**Organization rules:** updateOrganization ignores archived and createdAt. archiveOrganization hides/restores the firm without changing linked contacts or contracts. Organizations and contracts are never deleted.

## Contracts (Adrian)

| Function | Returns |
| --- | --- |
| `getContracts()` | `Contract[]` |
| `createContract(data)` | `Contract` |
| `updateContract(id, data)` | `Contract` |
| `archiveContract(id, archived)` | `Contract` |

## Shapes

These match `src/api/mockData.js`.

```js
Organization = { id, name, country, city, logo, archived, createdAt }  // logo: image data or null; archived: boolean
Contact = {
  id, firstName, middleName, lastName, prefix, suffix, title, status,
  orgId,                                    // null = Independent (no organization)
  photo,                                    // image data URL or null
  phones: [{ label, number }],              // label: 'Mobile' | 'Work' | 'Home' | 'Other'
  emails: [{ label, address }],             // label: 'Personal' | 'Work' | 'Other'
  address, spouse,                          // strings, '' if unknown
  children: [string],
  skills: [string],
  social: { x, instagram, snapchat, facebook },  // strings, '' if none
  createdAt, notes: [Note],
}
Note = { id, at, text }
Employment = { id, contactId, orgId, start, end }          // end: null while current
Contract = { id, contactId, orgId, title, location, value, status, start, end, notes, archived } // notes: free text, '' if none; status: 'active' | 'completed'; end on an active contract = expected end date (or null)
```

## Database rules (approved Oct 29, built into the UI)

The UI follows all of these. Archived contracts are hidden everywhere except the Archived page, a blank contract value shows as "—", and the contractor can't be changed when editing a contract.
- Remove deleteOrganization and deleteContract; use archiveOrganization and archiveContract(id, archived = true).
- Contract adds archived: boolean, initially false. Archiving does not complete a contract.
- Add updateNote(noteId, text) -> Note. Preserve at and retain prior text internally.
- List functions include archived records. Historical references remain resolvable.
- Contract value is a nonnegative safe integer in whole USD, or null when unknown.
- New contracts must match their contact's current orgId, including null for Independent. Existing associations remain unchanged after moves and cannot be edited.
- Contact creation starts active; protected fields cannot be supplied to override IDs, timestamps or notes.
- Not-found and invalid operations reject with a safe userMessage.
- Internal lifecycle: openDatabase(key: Buffer[32]), closeDatabase(), isOpen(), rekeyDatabase(newKey: Buffer[32]). These synchronous main-process functions are not renderer API methods. See database/README.md.

## Revision API additions: issues #40, #41 and #42

Proposed in this feature PR for coordinated UI review. Existing names and return fields remain supported.

Contact adds optional strings middleName (max 200), prefix and suffix (max 50 each).
They default to '' on creation/migration. updateContact preserves omitted fields; '' clears a field.
The existing getContacts/getContact responses supply these fields for UI search and Soundex matching.

### Organization attachments
- getOrganizationAttachments(orgId) -> Attachment[] (metadata only; includes archived)
- addOrganizationAttachment(orgId, { name, mimeType, dataBase64 }) -> Attachment
- getOrganizationAttachment(id) -> { ...Attachment, dataBase64 }
- archiveOrganizationAttachment(id, archived = true) -> Attachment
- linkOrganizationAttachment(id, { contactId, contractId }) -> Attachment (null or omitted = not about anyone; the whole firm)
- getContactAttachments(contactId) -> Attachment[] (files about this person, from any firm; includes archived)

addOrganizationAttachment also takes optional contactId and contractId. contractId must be one of the same firm's contracts. Database version 3 adds these two columns; version 1 and 2 databases upgrade on open.

Attachment = { id, orgId, contactId, contractId, name, mimeType, size, createdAt, archived }.
size is decoded bytes. Each file must be 1 byte through 10 MiB. Content and metadata live inside the encrypted database; no plaintext attachment cache is created.
Supported filename extensions/MIME pairs: PDF, PNG, JPEG, GIF, WebP, TXT, CSV, DOCX, XLSX and PPTX (see database/attachments.cjs for exact MIME strings).
Base64 must be canonical. Filenames cannot contain paths/control characters. File types are metadata validation, not antivirus scanning; bytes are never automatically executed or opened.
Archiving retains bytes. Files belonging to archived firms remain readable; restore the firm before adding files.
Mina's UI must enforce the same size limit before reading/encoding a file and filter archived metadata. Viewing/exporting plaintext files is not implemented by these APIs.

### Storage location (main-process folder dialog)
- getStorageLocation() -> { directory }
- chooseStorageLocation() -> { canceled: true } OR { ok: true, directory, restartRequired: true, originalRetained: true }

Both require a signed-in production session and reject dev:db mode. The renderer supplies no path.
The native picker chooses an existing empty folder. After the dialog, authentication is rechecked; relocation closes/checkpoints the database and locks the session.
crm.db and auth.json are copied together and verified before an atomic storage-location.json pointer in the original Electron userData folder is updated. Auria then restarts and requires login.
The original pair is retained as a recovery copy and is no longer the active database. Protect that copy: it still uses the password in effect when copied.
A failed copy leaves the original active and requires signing in again. An unavailable selected drive blocks startup rather than silently creating a new database. Reconnect the drive and restart.
No credentials are stored in the location pointer. Nic's authentication format and algorithms are unchanged.
