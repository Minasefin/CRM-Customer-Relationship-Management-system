// The UI only ever talks to the data through this file.
// Right now it returns mock data. When Adrian's database layer is exposed through
// electron/preload.cjs as window.crm.api, these functions call that instead.
// Function names and shapes are the contract in docs/API.md.
import * as mock from './mockData.js';

const real = typeof window !== 'undefined' && window.crm && window.crm.api;

export const api = real || {
  async getOrganizations() {
    return mock.organizations;
  },
  async getContacts() {
    return mock.contacts;
  },
  async getContracts() {
    return mock.contracts;
  },
};
