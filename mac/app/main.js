'use strict';
const { app, BrowserWindow, ipcMain, net, shell } = require('electron');
const path = require('path');

// The only hosts the page may reach through the main process. The renderer
// cannot ask for anything else.
const ALLOWED_HOSTS = new Set(['musicbrainz.org', 'api.genius.com']);

ipcMain.handle('fetch-json', async (_event, url, headers) => {
  const u = new URL(url);
  if (u.protocol !== 'https:' || !ALLOWED_HOSTS.has(u.hostname)) throw new Error('host not allowed: ' + u.hostname);
  const h = { 'User-Agent': 'SP404DROP/' + app.getVersion(), Accept: 'application/json' };
  if (headers && typeof headers.Authorization === 'string') h.Authorization = headers.Authorization;
  const res = await net.fetch(url, { headers: h });
  if (!res.ok) throw new Error(u.hostname + ' HTTP ' + res.status);
  return res.json();
});

function createWindow() {
  const win = new BrowserWindow({
    width: 760,
    height: 960,
    minWidth: 380,
    minHeight: 600,
    backgroundColor: '#131311',
    title: 'SP404 DROP',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
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

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => app.quit());
