// The UI only ever talks to the data through this file.
// Right now it returns mock data. When Adrian's database layer is exposed through
// electron/preload.cjs as window.crm.api, these functions call that instead.
// Function names and shapes are the contract in docs/API.md.
import * as mock from './mockData.js';

const real = typeof window !== 'undefined' && window.crm && window.crm.api;

// Mock changes live in memory only and reset when the app restarts.
let nextId = 1;
const newId = (prefix) => `${prefix}-mock-${nextId++}`;
const copy = (x) => JSON.parse(JSON.stringify(x));
const now = () => new Date().toISOString();
const find = (list, id) => {
  const x = list.find((y) => y.id === id);
  if (!x) throw new Error(`Not found: ${id}`);
  return x;
};

export const api = real || {
  // Organizations
  async getOrganizations() {
    return copy(mock.organizations);
  },
  async createOrganization(data) {
    const org = { id: newId('org'), logo: null, ...data };
    mock.organizations.push(org);
    return copy(org);
  },
  async updateOrganization(id, data) {
    const org = find(mock.organizations, id);
    Object.assign(org, data, { id });
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
  async setContactStatus(id, status) {
    const contact = find(mock.contacts, id);
    contact.status = status;
    return copy(contact);
  },
  async addNote(contactId, text) {
    const contact = find(mock.contacts, contactId);
    const note = { id: newId('n'), at: now(), text };
    contact.notes.push(note);
    return copy(note);
  },

  // Contracts
  async getContracts() {
    return copy(mock.contracts);
  },
};
