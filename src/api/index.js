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
  // Only for a firm nothing points to (no people ever, no contracts). Otherwise archive it.
  async deleteOrganization(id) {
    const used =
      mock.contacts.some((c) => c.orgId === id) ||
      mock.employment.some((e) => e.orgId === id) ||
      mock.contracts.some((k) => k.orgId === id);
    if (used) {
      const err = new Error('Organization is in use');
      err.userMessage = 'This organization has people, history or contracts, so it can only be archived.';
      throw err;
    }
    mock.organizations.splice(mock.organizations.findIndex((o) => o.id === id), 1);
    return { ok: true };
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
    const note = { id: newId('n'), at: now(), text };
    contact.notes.push(note);
    return copy(note);
  },

  // Contracts
  async getContracts() {
    return copy(mock.contracts);
  },
  async createContract(data) {
    const contract = { id: newId('k'), status: 'active', end: null, ...data };
    mock.contracts.push(contract);
    return copy(contract);
  },
  async updateContract(id, data) {
    const contract = find(mock.contracts, id);
    Object.assign(contract, data, { id });
    return copy(contract);
  },
  async deleteContract(id) {
    find(mock.contracts, id);
    mock.contracts.splice(mock.contracts.findIndex((k) => k.id === id), 1);
    return { ok: true };
  },
};
