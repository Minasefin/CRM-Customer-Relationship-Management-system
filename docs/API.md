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

## Contacts (Adrian)

| Function | Returns | Notes |
| --- | --- | --- |
| `getContacts()` | `Contact[]` | Includes `notes`, so "last contacted" can be worked out |
| `getContact(id)` | `Contact` | |
| `createContact(data)` | `Contact` | |
| `updateContact(id, data)` | `Contact` | |
| `setContactStatus(id, status)` | `Contact` | `'active' \| 'inactive' \| 'deceased'`. No delete function on purpose. |
| `moveContact(id, newOrgId)` | `Contact` | Adds a row to employment history |
| `getEmploymentHistory(contactId)` | `Employment[]` | |
| `addNote(contactId, text)` | `Note` | Timestamp set by the database |

## Contracts (Adrian)

| Function | Returns |
| --- | --- |
| `getContracts()` | `Contract[]` |
| `createContract(data)` | `Contract` |
| `updateContract(id, data)` | `Contract` |

## Shapes

These match `src/api/mockData.js`.

```js
Organization = { id, name, country, city, logo }            // logo: image data or null
Contact = {
  id, orgId, firstName, lastName, title, status,
  phone, email, photo, skills: [string],
  createdAt, notes: [Note],
  // later: addresses, spouse, children, social: { x, instagram, snapchat, facebook }
}
Note = { id, at, text }
Employment = { id, contactId, orgId, start, end }          // end: null while current
Contract = { id, contactId, orgId, title, location, value, status, start, end } // status: 'active' | 'completed'
```
