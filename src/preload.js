const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petAPI', {
  dragStart: (point) => ipcRenderer.send('drag:start', point),
  dragEnd: () => ipcRenderer.send('drag:end'),
  setMousePassthrough: (ignore) => ipcRenderer.send('mouse:passthrough', ignore),
  togglePanel: () => ipcRenderer.send('panel:toggle'),
  closePanel: () => ipcRenderer.send('panel:close'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  addReminder: (reminder) => ipcRenderer.invoke('reminder:add', reminder),
  removeReminder: (id) => ipcRenderer.invoke('reminder:remove', id),
  askAI: (message) => ipcRenderer.invoke('ai:ask', message),
  resetAI: () => ipcRenderer.invoke('ai:reset'),
  onPetState: (callback) => ipcRenderer.on('pet:state', (_event, state) => callback(state)),
  onPetSay: (callback) => ipcRenderer.on('pet:say', (_event, message) => callback(message)),
  onPetScale: (callback) => ipcRenderer.on('pet:scale', (_event, scale) => callback(scale)),
  onOpenPanel: (callback) => ipcRenderer.on('panel:open', (_event, tab) => callback(tab)),
  onTogglePanel: (callback) => ipcRenderer.on('panel:toggle', callback),
  onClosePanel: (callback) => ipcRenderer.on('panel:close', callback)
});
