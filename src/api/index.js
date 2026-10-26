// The UI only ever talks to the data through this file.
// Right now it returns mock data. When Adrian's database layer is exposed through
// electron/preload.cjs as window.crm.api, these functions call that instead.
// Function names and shapes are the contract in docs/API.md.
import * as mock from './mockData.js';

const real = typeof window !== 'undefined' && window.crm && window.crm.api;

// Mock changes live in memory only and reset when the app restarts.
let nextId = 1;
const copy = (x) => JSON.parse(JSON.stringify(x));

export const api = real || {
  async getOrganizations() {
    return copy(mock.organizations);
  },
  async getContacts() {
    return copy(mock.contacts);
  },
  async getContracts() {
    return copy(mock.contracts);
  },
  async addNote(contactId, text) {
    const c = mock.contacts.find((x) => x.id === contactId);
    const note = { id: `mock-note-${nextId++}`, at: new Date().toISOString(), text };
    c.notes.push(note);
    return copy(note);
  },
  async setContactStatus(id, status) {
    const c = mock.contacts.find((x) => x.id === id);
    c.status = status;
    return copy(c);
  },
};
