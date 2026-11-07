'use strict';
const {app,dialog}=require('electron');
const {handle}=require('./ipc.cjs');
const {relocateStorage}=require('../database/storage.cjs');
function setupStorageBridge(context) {
  let selecting=false;
  const check=()=>{
    if(!context) throw Object.assign(new Error('Storage relocation is unavailable in dev:db mode.'),{userMessage:'Storage relocation is unavailable in dev:db mode.'});
    context.auth.assertUnlocked();
  };
  handle('storage:getStorageLocation',()=>{check();return {directory:context.directory};});
  handle('storage:chooseStorageLocation',async()=>{
    check();
    if(selecting) throw Object.assign(new Error('A folder dialog is already open.'),{userMessage:'A folder dialog is already open.'});
    selecting=true;
    try {
      const chosen=await dialog.showOpenDialog({title:'Choose an empty folder for the database and login files',properties:['openDirectory','createDirectory']});
      if(chosen.canceled||!chosen.filePaths.length) return {canceled:true};
      check(); // Reject if locked or a password change started while the dialog was open.
      context.db.prepareRelocation();
      context.auth.lock();
      // Block all subsequent auth calls against the retained old copy until restart.
      const result=relocateStorage(app.getPath('userData'),context.directory,chosen.filePaths[0]);
      context.auth.requireRestart();
      app.relaunch();app.quit();
      return result;
    } finally {selecting=false;}
  });
}
module.exports={setupStorageBridge};
