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

// Adds a sample file (same rules as the database: a firm, a person, or both).
const addMockFile = (orgId, { name, mimeType, dataBase64, contactId = null, contractId = null }) => {
  if (orgId !== null && find(mock.organizations, orgId).archived) fail('Restore the organization before assigning records.');
  checkFileLinks(orgId, contactId, contractId);
  const size = Math.floor((dataBase64.length * 3) / 4) - (dataBase64.endsWith('==') ? 2 : dataBase64.endsWith('=') ? 1 : 0);
  const a = { id: newId('a'), orgId, contactId, contractId, name, mimeType, size, createdAt: now(), archived: false, dataBase64 };
  mock.attachments.push(a);
  const { dataBase64: _, ...meta } = a;
  return copy(meta);
};
// A file can be about one person and/or one of the same firm's contracts (same rules as the database).
const checkFileLinks = (orgId, contactId, contractId) => {
  if (contactId !== null) find(mock.contacts, contactId);
  if (contractId !== null && find(mock.contracts, contractId).orgId !== orgId) fail('That contract belongs to another organization.');
};

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

  // Files attached to a firm (#41). Metadata only in lists; the bytes come with getOrganizationAttachment.
  async getOrganizationAttachments(orgId) {
    find(mock.organizations, orgId);
    return copy(mock.attachments.filter((a) => a.orgId === orgId).map(({ dataBase64, ...meta }) => meta));
  },
  async addOrganizationAttachment(orgId, { name, mimeType, dataBase64, contactId = null, contractId = null }) {
    const org = find(mock.organizations, orgId);
    if (org.archived) fail('Restore the organization before assigning records.');
    checkFileLinks(orgId, contactId, contractId);
    const a = { id: newId('a'), orgId, contactId, contractId, name, mimeType, size: Math.floor((dataBase64.length * 3) / 4) - (dataBase64.endsWith('==') ? 2 : dataBase64.endsWith('=') ? 1 : 0), createdAt: now(), archived: false, dataBase64 };
    mock.attachments.push(a);
    const { dataBase64: _, ...meta } = a;
    return copy(meta);
  },
  async getContactAttachments(contactId) {
    find(mock.contacts, contactId);
    return copy(mock.attachments.filter((a) => a.contactId === contactId).map(({ dataBase64, ...meta }) => meta));
  },
  // A file about one person, kept with their current firm (or no firm if they're independent).
  async addContactAttachment(contactId, data) {
    const c = find(mock.contacts, contactId);
    return addMockFile(c.orgId, { ...data, contactId });
  },
  // A file for one contract: kept with the contract's firm (if any), about its contractor.
  async addContractAttachment(contractId, data) {
    const k = find(mock.contracts, contractId);
    return addMockFile(k.orgId, { ...data, contactId: k.contactId, contractId });
  },
  async getContractAttachments(contractId) {
    find(mock.contracts, contractId);
    return copy(mock.attachments.filter((a) => a.contractId === contractId).map(({ dataBase64, ...meta }) => meta));
  },
  // Change who/what a file is about. null = the whole firm.
  async linkOrganizationAttachment(id, { contactId = null, contractId = null } = {}) {
    const a = find(mock.attachments, id);
    checkFileLinks(a.orgId, contactId, contractId);
    if (a.orgId === null && contactId === null) fail("This file isn't kept with a firm, so it has to be about someone.");
    Object.assign(a, { contactId, contractId });
    const { dataBase64, ...meta } = a;
    return copy(meta);
  },
  async getOrganizationAttachment(id) {
    return copy(find(mock.attachments, id));
  },
  async archiveOrganizationAttachment(id, archived = true) {
    const a = find(mock.attachments, id);
    a.archived = archived;
    const { dataBase64, ...meta } = a;
    return copy(meta);
  },
  async saveAttachmentCopy() {
    fail("Saving a copy works with your saved data, not the sample data.");
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
