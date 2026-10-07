'use strict';
const { contextBridge, ipcRenderer } = require('electron');
/* The renderer stays sandboxed; this is the only door to the file system. */
contextBridge.exposeInMainWorld('spBridge', {
  openInLearn: (payload) => ipcRenderer.invoke('spsystem:open-in-learn', payload)
});
