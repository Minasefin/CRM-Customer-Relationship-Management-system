// The UI only ever talks to the data through this file.
// When the app opened Adrian's encrypted database (today: `npm run dev:db`), the preload
// exposes it as window.crm.api and every call goes there. Otherwise these functions use
// sample data in memory, with the same names, shapes and rules (docs/API.md).
import * as mock from './mockData.js';

const crm = typeof window !== 'undefined' ? window.crm : undefined;
// Auth exists even while locked. The preload reloads after login/logout so this
// selection cannot retain a previous session's data or write samples to disk.
const real = crm && ['database', 'dev-database'].includes(crm.dataMode) && crm.api;

// 'database' = saved in the encrypted database; 'sample' = sample data, resets on restart.
export const dataMode = real ? 'database' : 'sample';
// Why the test database didn't open, if `npm run dev:db` was used and something went wrong.
export const dataError = (crm && crm.dataError) || null;

// Mock changes live in memory only and reset when the app restarts.
let nextId = 1;
const newId = (prefix) => `${prefix}-mock-${nextId++}`;
const copy = (x) => JSON.parse(JSON.stringify(x));
const now = () => new Date().toISOString();
const fail = (message) => {
  const err = new Error(message);
  err.userMessage = message;
  throw err;
};
const find = (list, id) => list.find((y) => y.id === id) || fail('Record not found.');

export const api = real || {
  // Organizations
  async getOrganizations() {
    return copy(mock.organizations);
  },
  async createOrganization(data) {
    const org = { id: newId('org'), logo: null, archived: false, createdAt: now(), ...data };
    mock.organizations.push(org);
    return copy(org);
  },
  async updateOrganization(id, data) {
    const org = find(mock.organizations, id);
    const { archived, createdAt, ...rest } = data;
    Object.assign(org, rest, { id });
    return copy(org);
  },
  // Hides a firm from lists but keeps everything linked to it. archived=false restores it.
  async archiveOrganization(id, archived = true) {
    const org = find(mock.organizations, id);
    org.archived = archived;
    return copy(org);
  },

  // Contacts
  async getContacts() {
    return copy(mock.contacts);
  },
  async createContact(data) {
    const contact = { id: newId('c'), status: 'active', notes: [], createdAt: now(), ...data };
    mock.contacts.push(contact);
    if (contact.orgId) {
      mock.employment.push({ id: newId('e'), contactId: contact.id, orgId: contact.orgId, start: now(), end: null });
    }
    return copy(contact);
  },
  // Does NOT change orgId. Use moveContact for that so history is kept.
  async updateContact(id, data) {
    const contact = find(mock.contacts, id);
    const { orgId, notes, status, createdAt, ...rest } = data;
    Object.assign(contact, rest, { id });
    return copy(contact);
  },
  async moveContact(id, newOrgId) {
    const contact = find(mock.contacts, id);
    const at = now();
    mock.employment
      .filter((e) => e.contactId === id && e.end === null)
      .forEach((e) => (e.end = at));
    if (newOrgId) mock.employment.push({ id: newId('e'), contactId: id, orgId: newOrgId, start: at, end: null });
    contact.orgId = newOrgId;
    return copy(contact);
  },
  async getEmploymentHistory(contactId) {
    return copy(mock.employment.filter((e) => e.contactId === contactId));
  },
  async getAllEmployment() {
    return copy(mock.employment);
  },
  async setContactStatus(id, status) {
    const contact = find(mock.contacts, id);
    contact.status = status;
    return copy(contact);
  },
  async addNote(contactId, text) {
    const contact = find(mock.contacts, contactId);
    if (!String(text).trim()) fail('Note cannot be empty.');
    const note = { id: newId('n'), at: now(), text: String(text).trim() };
    contact.notes.push(note);
    return copy(note);
  },
  // Fixes a note's text. Keeps its original date, so a typo fix isn't a new check-in.
  async updateNote(noteId, text) {
    if (!String(text).trim()) fail('Note cannot be empty.');
    for (const c of mock.contacts) {
      const n = c.notes.find((x) => x.id === noteId);
      if (n) {
        n.text = String(text).trim();
        return copy(n);
      }
    }
    fail('Record not found.');
  },

  // Contracts
  async getContracts() {
    return copy(mock.contracts);
  },
  async createContract(data) {
    const contract = { id: newId('k'), status: 'active', end: null, value: null, notes: '', archived: false, ...data };
    mock.contracts.push(contract);
    return copy(contract);
  },
  // Who a contract is with (and their firm at the time) can't change after it's created.
  async updateContract(id, data) {
    const contract = find(mock.contracts, id);
    if ((data.contactId !== undefined && data.contactId !== contract.contactId) || (data.orgId !== undefined && data.orgId !== contract.orgId)) {
      fail('Contract associations cannot be changed.');
    }
    const { archived, ...rest } = data;
    Object.assign(contract, rest, { id });
    return copy(contract);
  },
  // Contracts are never deleted. Archiving hides one; archived=false restores it.
  async archiveContract(id, archived = true) {
    const contract = find(mock.contracts, id);
    contract.archived = archived;
    return copy(contract);
  },
};
