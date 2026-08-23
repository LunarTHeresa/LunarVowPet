const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petAPI', {
  dragStart: (point) => ipcRenderer.send('drag:start', point),
  dragEnd: () => ipcRenderer.send('drag:end'),
  interact: () => ipcRenderer.send('pet:interact'),
  previewScale: (scale) => ipcRenderer.send('pet:scale-preview', scale),
  openPanel: (tab) => ipcRenderer.send('panel:open-request', tab),
  say: (message) => ipcRenderer.send('pet:say-request', message),
  setMousePassthrough: (ignore) => ipcRenderer.send('mouse:passthrough', ignore),
  togglePanel: () => ipcRenderer.send('panel:toggle'),
  closePanel: () => ipcRenderer.send('panel:close'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  addReminder: (reminder) => ipcRenderer.invoke('reminder:add', reminder),
  removeReminder: (id) => ipcRenderer.invoke('reminder:remove', id),
  askAI: (message) => ipcRenderer.invoke('ai:ask', message),
  resetAI: () => ipcRenderer.invoke('ai:reset'),
  onPetExpression: (callback) => ipcRenderer.on('pet:expression', (_event, expression) => callback(expression)),
  onPetDragging: (callback) => ipcRenderer.on('pet:dragging', (_event, value) => callback(Boolean(value))),
  onPetSay: (callback) => ipcRenderer.on('pet:say', (_event, message) => callback(message)),
  onPetScale: (callback) => ipcRenderer.on('pet:scale', (_event, scale) => callback(scale)),
  onOpenPanel: (callback) => ipcRenderer.on('panel:open', (_event, tab) => callback(tab)),
  onTogglePanel: (callback) => ipcRenderer.on('panel:toggle', callback),
  onClosePanel: (callback) => ipcRenderer.on('panel:close', callback)
});
