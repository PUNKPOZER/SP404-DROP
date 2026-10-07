'use strict';
const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let win = null;
let rendererReady = false;     // the page has installed its project-open listener
const pendingPaths = [];       // .spsystem paths received before the page was ready (cold start)

function createWindow() {
  win = new BrowserWindow({
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
  rendererReady = false;
  win.loadFile(path.join(__dirname, 'index.html'));
  // Links open in the default browser; dropping a file on the window must not navigate away.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.on('closed', () => { win = null; rendererReady = false; });
}

/* ---- opening a .spsystem from outside: ONE pipeline (project-open.js -> openExternalProject) ---- */
function isProjectPath(p) { return typeof p === 'string' && /\.spsystem$/i.test(p); }
function projectPathsFromArgv(argv) { return argv.slice(1).filter((a) => isProjectPath(a) && fs.existsSync(a)); }

function deliver(file) {
  const { openExternalProject } = require('./project-open.js');
  return openExternalProject(file).then((res) => {
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore();
      win.focus();
      win.webContents.send('spsystem:opened', res);
    }
  });
}
function handleOpen(file) {
  if (!isProjectPath(file)) return;
  if (win && rendererReady) deliver(file);
  else { pendingPaths.push(file); if (app.isReady() && !win) createWindow(); }
}

// macOS delivers `open -a "SP404 DROP" x.spsystem` (cold or warm) as an open-file event. It can fire before 'ready'.
app.on('open-file', (event, file) => { event.preventDefault(); handleOpen(file); });

// A second process launched with a path (Windows/Linux, or the binary run directly) forwards it to the running instance.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
else app.on('second-instance', (_e, argv) => { projectPathsFromArgv(argv).forEach(handleOpen); if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

function trusted(event) { return event.senderFrame && /^file:/.test(event.senderFrame.url); }
const denied = { ok: false, code: 'E_FORBIDDEN', message: 'untrusted sender' };

ipcMain.handle('spsystem:ready', (event) => {
  if (!trusted(event)) return false;
  rendererReady = true;
  while (pendingPaths.length) deliver(pendingPaths.shift());
  return true;
});
ipcMain.handle('spsystem:open-in-learn', (event, payload) => (trusted(event) ? require('./open-in-learn.js').run(payload) : denied));
ipcMain.handle('spsystem:save', (event, payload) => (trusted(event) ? require('./project-open.js').saveSession(payload) : denied));
ipcMain.handle('spsystem:accept', (event, key, id, kind) => (trusted(event) ? require('./project-open.js').acceptSuggestion(key, id, kind) : denied));

app.whenReady().then(() => {
  projectPathsFromArgv(process.argv).forEach((f) => pendingPaths.push(f));
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => app.quit());
