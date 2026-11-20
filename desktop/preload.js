const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('diskord', {
  version: ipcRenderer.sendSync('version'),
  login: () => ipcRenderer.send('login'),
  signup: () => ipcRenderer.send('signup'),
  retry: () => ipcRenderer.send('retry'),
  quit: () => ipcRenderer.send('quit'),
  onStatus: cb => ipcRenderer.on('status', (_e, t) => cb(t))
});
