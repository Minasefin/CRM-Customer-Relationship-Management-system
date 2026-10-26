// The only bridge between the UI and the rest of the app.
// When the database and auth layers are ready, expose their functions here, e.g.:
//   getContacts: () => ipcRenderer.invoke('db:getContacts'),
// The UI checks for window.crm.api and falls back to mock data until it exists.
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('crm', {
  platform: process.platform,
  // api: { ...functions from docs/API.md }
});
