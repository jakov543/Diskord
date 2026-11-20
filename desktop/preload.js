const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('diskord', {
  version: ipcRenderer.sendSync('version'),
  retry: () => ipcRenderer.send('retry'),
  quit: () => ipcRenderer.send('quit'),
  presence: p => ipcRenderer.send('presence', p),
  upload: (buf, name, type) => ipcRenderer.invoke('upload', { buf, name, type }),
  onStatus: cb => ipcRenderer.on('status', (_e, t) => cb(t)),
  onSources: cb => ipcRenderer.on('sources', (_e, s) => cb(s)),
  screenSources: () => ipcRenderer.invoke('screen-sources'),
  shareSource: (id, audio) => ipcRenderer.invoke('share-source', { id, audio }),
  pickerChoose: (id, audio) => ipcRenderer.send('picker-choice', { id, audio })
});
