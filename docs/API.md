# Function contract (draft)

These are the functions the UI calls. Adrian (database) and Nic (auth) implement them; Mina's UI calls them through `window.crm.api`. **This is a draft. Change it together, in a pull request, before building against it.**

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
| `addNote(contactId, text)` | `Note` | Timestamp set by the database |

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
  id, firstName, lastName, title, status,
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

## Database implementation proposal for teammate review

Approved by Adrian for this branch; UI/auth integration must adopt these changes together:
- Remove deleteOrganization and deleteContract; use archiveOrganization and archiveContract(id, archived = true).
- Contract adds archived: boolean, initially false. Archiving does not complete a contract.
- Add updateNote(noteId, text) -> Note. Preserve at and retain prior text internally.
- List functions include archived records. Historical references remain resolvable.
- Contract value is a nonnegative safe integer in whole USD, or null when unknown.
- New contracts must match their contact's current orgId, including null for Independent. Existing associations remain unchanged after moves and cannot be edited.
- Contact creation starts active; protected fields cannot be supplied to override IDs, timestamps or notes.
- Not-found and invalid operations reject with a safe userMessage.
- Internal lifecycle: openDatabase(key: Buffer[32]), closeDatabase(), isOpen(), rekeyDatabase(newKey: Buffer[32]). These synchronous main-process functions are not renderer API methods. See database/README.md.
