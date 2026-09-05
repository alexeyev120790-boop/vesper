const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  sendNotification: (title, body) => ipcRenderer.send('show-notification', { title, body }),
  updateCallState: (data) => ipcRenderer.send('call-state-update', data),
  updateCallSpeaking: (data) => ipcRenderer.send('call-speaking-update', data),
  onOverlayCallAction: (callback) => ipcRenderer.on('overlay-call-action', (event, action) => callback(action)),
  onOverlayUpdate: (callback) => ipcRenderer.on('overlay-update', (event, data) => callback(data)),
  onOverlaySpeaking: (callback) => ipcRenderer.on('overlay-speaking', (event, data) => callback(data)),
  sendOverlayAction: (action) => ipcRenderer.send('overlay-action', action),
  restoreMainWindow: () => ipcRenderer.send('restore-main-window'),
  requestOverlayUpdate: () => ipcRenderer.send('request-overlay-update'),
  toggleOverlayWindow: (force) => ipcRenderer.send('toggle-overlay-window', force)
});
