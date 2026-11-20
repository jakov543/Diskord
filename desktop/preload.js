const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('diskord', {
  version: ipcRenderer.sendSync('version'),
  retry: () => ipcRenderer.send('retry'),
  quit: () => ipcRenderer.send('quit'),
  presence: p => ipcRenderer.send('presence', p),
  upload: (buf, name, type) => ipcRenderer.invoke('upload', { buf, name, type }),
  onStatus: cb => ipcRenderer.on('status', (_e, t) => cb(t))
});
