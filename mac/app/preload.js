'use strict';
const { contextBridge, ipcRenderer } = require('electron');
/* The renderer stays sandboxed; this is the only door to the file system. Paths are chosen by the main process. */
contextBridge.exposeInMainWorld('spBridge', {
  openInLearn: (payload) => ipcRenderer.invoke('spsystem:open-in-learn', payload),
  saveProject: (payload) => ipcRenderer.invoke('spsystem:save', payload),
  acceptSuggestion: (key, id, kind) => ipcRenderer.invoke('spsystem:accept', key, id, kind),
  // a project handed to DROP from outside (LEARN / macOS open): the page registers a listener, then calls ready()
  onProjectOpened: (cb) => ipcRenderer.on('spsystem:opened', (_e, res) => cb(res)),
  ready: () => ipcRenderer.invoke('spsystem:ready')
});
