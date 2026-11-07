// "Save a copy…" for a firm's file (#41).
// The main process reads the file from the encrypted database and writes it ONLY where the
// person picks in the system's save dialog. The page never sends a path. The saved copy is
// a normal, unencrypted file; the screen warns about that before calling this.
const { app, dialog, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const { handle } = require('./ipc.cjs');

const userError = (m) => Object.assign(new Error(m), { userMessage: m });

function setupFilesBridge({ db, assertUnlocked = () => {} }) {
  let open = false;
  handle('files:saveAttachmentCopy', async (id) => {
    assertUnlocked();
    if (open) throw userError('A save dialog is already open.');
    open = true;
    try {
      const file = await db.getOrganizationAttachment(id);
      // The name was checked when the file was added; basename is a second guard.
      const name = path.basename(String(file.name)) || 'file';
      const options = {
        title: 'Save a copy (not encrypted)',
        defaultPath: path.join(app.getPath('downloads'), name),
        properties: ['createDirectory', 'showOverwriteConfirmation'],
      };
      const win = BrowserWindow.getFocusedWindow();
      const choice = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
      if (choice.canceled || !choice.filePath) return { canceled: true };
      assertUnlocked(); // the app may have locked while the dialog was open
      fs.writeFileSync(choice.filePath, Buffer.from(file.dataBase64, 'base64'), { mode: 0o600 });
      return { ok: true, name: path.basename(choice.filePath) };
    } finally {
      open = false;
    }
  });
}

module.exports = { setupFilesBridge };
