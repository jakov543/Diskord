const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('diskord', {
  version: ipcRenderer.sendSync('version'),
  retry: () => ipcRenderer.send('retry'),
  quit: () => ipcRenderer.send('quit'),
  onStatus: cb => ipcRenderer.on('status', (_e, t) => cb(t))
});
