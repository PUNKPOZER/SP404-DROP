'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('sp404', {
  fetchJson: (url, headers) => ipcRenderer.invoke('fetch-json', url, headers)
});
