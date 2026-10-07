'use strict';
const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1120,
    height: 820,
    minWidth: 360,
    minHeight: 560,
    backgroundColor: '#F2F1EC', // SP SYSTEM paper
    title: 'SP404 DROP',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  win.loadFile(path.join(__dirname, 'index.html'));
  // Links open in the default browser; dropping a file on the window must not navigate away.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
}

ipcMain.handle('spsystem:open-in-learn', (event, payload) => {
  // only our own window may ask; the payload is plain data (no paths) — the file location is decided here
  if (!event.senderFrame || !/^file:/.test(event.senderFrame.url)) return { ok: false, code: 'E_FORBIDDEN', message: 'untrusted sender' };
  return require('./open-in-learn.js').run(payload);
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => app.quit());
