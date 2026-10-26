// The only bridge between the UI and the rest of the app.
//
// Rules (see SECURITY.md):
// - Expose one named function per action. NEVER expose ipcRenderer, require, or a
//   generic "send any channel" function. The page should only be able to do the
//   exact things listed in docs/API.md.
// - Pass plain values in and out. Never pass callbacks or Node objects.
//
// When the database and auth layers are ready, add them here, e.g.:
//   getContacts: () => ipcRenderer.invoke('db:getContacts'),
// and register the channel in main.cjs with handle() from ./ipc.cjs.
// The UI checks for window.crm.api and falls back to mock data until it exists.
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('crm', {
  platform: process.platform,
  // api: { ...functions from docs/API.md }
});
