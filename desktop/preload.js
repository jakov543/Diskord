const { contextBridge, ipcRenderer, webFrame } = require('electron');
contextBridge.exposeInMainWorld('diskord', {
  version: ipcRenderer.sendSync('version'),
  retry: () => ipcRenderer.send('retry'),
  quit: () => ipcRenderer.send('quit'),
  presence: p => ipcRenderer.send('presence', p),
  upload: (buf, name, type) => ipcRenderer.invoke('upload', { buf, name, type }),
  onStatus: cb => ipcRenderer.on('status', (_e, t) => cb(t)),
  onSources: cb => ipcRenderer.on('sources', (_e, s) => cb(s)),
  setZoom: f => { const z = Number(f); if (z >= .5 && z <= 2) webFrame.setZoomFactor(z); },
  onUpdate: cb => ipcRenderer.on('update', (_e, u) => cb(u)),
  updateNow: () => ipcRenderer.send('update-now'),
  checkUpdates: () => ipcRenderer.send('update-check'),
  gifFetch: url => ipcRenderer.invoke('gif-fetch', url),
  screenSources: () => ipcRenderer.invoke('screen-sources'),
  shareSource: (id, audio) => ipcRenderer.invoke('share-source', { id, audio }),
  pickerChoose: (id, audio) => ipcRenderer.send('picker-choice', { id, audio })
});
