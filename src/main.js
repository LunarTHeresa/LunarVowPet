const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, screen, Notification, safeStorage, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const PET_SIZE = { width: 330, height: 430 };
const STEP_MS = 54;
let petWindow;
let tray;
let motionTimer;
let reminderTimer;
let walking = true;
let direction = -1;
let paused = false;
let dragging = false;
let dragOffset = { x: 0, y: 0 };
let nextDecisionAt = 0;
let settings = {};
let previousResponseId = null;

const defaults = {
  alwaysOnTop: true,
  launchAtLogin: false,
  walking: true,
  model: 'gpt-5.6-luna',
  reminders: []
};

function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function loadSettings() {
  try {
    settings = { ...defaults, ...JSON.parse(fs.readFileSync(settingsPath(), 'utf8')) };
  } catch {
    settings = { ...defaults };
  }
  walking = settings.walking;
}

function saveSettings() {
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2));
}

function encryptSecret(value) {
  if (!value) return '';
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows 系统加密暂不可用');
  return safeStorage.encryptString(value).toString('base64');
}

function decryptSecret(value) {
  if (!value) return '';
  try {
    return safeStorage.decryptString(Buffer.from(value, 'base64'));
  } catch {
    return '';
  }
}

function activeWorkArea() {
  if (!petWindow) return screen.getPrimaryDisplay().workArea;
  return screen.getDisplayMatching(petWindow.getBounds()).workArea;
}

function clampPosition(x, y) {
  const area = activeWorkArea();
  return {
    x: Math.max(area.x, Math.min(x, area.x + area.width - PET_SIZE.width)),
    y: Math.max(area.y, Math.min(y, area.y + area.height - PET_SIZE.height))
  };
}

function createPetWindow() {
  const area = screen.getPrimaryDisplay().workArea;
  petWindow = new BrowserWindow({
    ...PET_SIZE,
    x: area.x + area.width - PET_SIZE.width - 24,
    y: area.y + area.height - PET_SIZE.height,
    transparent: true,
    frame: false,
    resizable: false,
    movable: true,
    alwaysOnTop: settings.alwaysOnTop,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  petWindow.setMenuBarVisibility(false);
  petWindow.loadFile(path.join(__dirname, 'index.html'));
  petWindow.once('ready-to-show', () => petWindow.showInactive());
  petWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      petWindow.hide();
    }
  });
  petWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  petWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  petWindow.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
}

function refreshTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: petWindow?.isVisible() ? '藏起月下' : '唤醒月下', click: () => petWindow?.isVisible() ? petWindow.hide() : petWindow.showInactive() },
    { label: walking ? '暂停散步' : '继续散步', click: () => setWalking(!walking) },
    { label: '打开聊天与提醒', click: () => openPanel('chat') },
    { label: '设置提醒', click: () => openPanel('reminders') },
    { type: 'separator' },
    { label: '始终置顶', type: 'checkbox', checked: settings.alwaysOnTop, click: (item) => setAlwaysOnTop(item.checked) },
    { label: '开机自启', type: 'checkbox', checked: settings.launchAtLogin, click: (item) => setLaunchAtLogin(item.checked) },
    { type: 'separator' },
    { label: '退出', click: () => { app.isQuitting = true; app.quit(); } }
  ]));
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png'));
  tray = new Tray(icon);
  tray.setToolTip('月下誓约桌宠');
  tray.on('click', () => petWindow?.isVisible() ? petWindow.hide() : petWindow.showInactive());
  refreshTrayMenu();
}

function openPanel(tab = 'chat') {
  if (!petWindow) return;
  petWindow.show();
  petWindow.focus();
  petWindow.webContents.send('panel:open', tab);
}

function setWalking(value) {
  walking = Boolean(value);
  settings.walking = walking;
  saveSettings();
  petWindow?.webContents.send('pet:state', walking ? `walk-${direction < 0 ? 'left' : 'right'}` : 'idle');
  refreshTrayMenu();
}

function setAlwaysOnTop(value) {
  settings.alwaysOnTop = Boolean(value);
  petWindow?.setAlwaysOnTop(settings.alwaysOnTop);
  saveSettings();
  refreshTrayMenu();
}

function setLaunchAtLogin(value) {
  settings.launchAtLogin = Boolean(value);
  app.setLoginItemSettings({ openAtLogin: settings.launchAtLogin, path: process.execPath });
  saveSettings();
  refreshTrayMenu();
}

function startMotion() {
  clearInterval(motionTimer);
  nextDecisionAt = Date.now() + 7000;
  motionTimer = setInterval(() => {
    if (!petWindow || !petWindow.isVisible() || dragging || paused) return;
    if (Date.now() >= nextDecisionAt) {
      if (Math.random() < 0.34) walking = false;
      else {
        walking = settings.walking;
        if (Math.random() < 0.38) direction *= -1;
      }
      nextDecisionAt = Date.now() + 5000 + Math.random() * 9000;
      petWindow.webContents.send('pet:state', walking ? `walk-${direction < 0 ? 'left' : 'right'}` : 'idle');
    }
    if (!walking) return;
    const bounds = petWindow.getBounds();
    const area = activeWorkArea();
    let x = bounds.x + direction * 2;
    if (x <= area.x || x >= area.x + area.width - bounds.width) {
      direction *= -1;
      x = Math.max(area.x, Math.min(x, area.x + area.width - bounds.width));
      petWindow.webContents.send('pet:state', `walk-${direction < 0 ? 'left' : 'right'}`);
    }
    petWindow.setPosition(Math.round(x), area.y + area.height - bounds.height, false);
  }, STEP_MS);
}

function scheduleReminders() {
  clearTimeout(reminderTimer);
  const now = Date.now();
  settings.reminders = (settings.reminders || []).filter((item) => !item.done);
  const next = settings.reminders
    .filter((item) => new Date(item.when).getTime() > now)
    .sort((a, b) => new Date(a.when) - new Date(b.when))[0];
  if (!next) return;
  const delay = Math.min(new Date(next.when).getTime() - now, 2_147_000_000);
  reminderTimer = setTimeout(() => {
    const remaining = new Date(next.when).getTime() - Date.now();
    if (remaining > 1500) return scheduleReminders();
    next.done = true;
    saveSettings();
    new Notification({ title: '月下提醒你', body: next.text, icon: path.join(__dirname, 'assets', 'tray.png') }).show();
    petWindow?.showInactive();
    petWindow?.webContents.send('pet:say', `该做「${next.text}」啦。`);
    scheduleReminders();
  }, Math.max(0, delay));
}

function extractResponseText(data) {
  if (typeof data.output_text === 'string') return data.output_text;
  return (data.output || [])
    .flatMap((item) => item.content || [])
    .filter((item) => item.type === 'output_text')
    .map((item) => item.text)
    .join('\n');
}

async function askAI(message) {
  const apiKey = decryptSecret(settings.apiKey);
  if (!apiKey) throw new Error('请先在设置中填写 OpenAI API Key');
  const body = {
    model: settings.model || defaults.model,
    instructions: '你是用户的桌宠月下。用自然、温柔、略带俏皮的中文回复。回答简短，通常不超过三句话；不要声称自己能操作没有提供的系统功能。',
    input: message,
    text: { verbosity: 'low' },
    store: true
  };
  if (previousResponseId) body.previous_response_id = previousResponseId;
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || `请求失败 (${response.status})`);
  previousResponseId = data.id;
  return extractResponseText(data) || '我听见啦。';
}

function registerIpc() {
  ipcMain.on('drag:start', (_event, point) => {
    dragging = true;
    dragOffset = { x: point.x, y: point.y };
    petWindow?.webContents.send('pet:state', 'dragging');
  });
  ipcMain.on('drag:move', (_event, point) => {
    if (!dragging || !petWindow) return;
    const pos = clampPosition(point.screenX - dragOffset.x, point.screenY - dragOffset.y);
    petWindow.setPosition(Math.round(pos.x), Math.round(pos.y), false);
  });
  ipcMain.on('drag:end', () => {
    dragging = false;
    const bounds = petWindow?.getBounds();
    if (bounds) {
      const area = activeWorkArea();
      petWindow.setPosition(bounds.x, area.y + area.height - bounds.height, true);
    }
    petWindow?.webContents.send('pet:state', 'idle');
  });
  ipcMain.on('mouse:passthrough', (_event, ignore) => {
    petWindow?.setIgnoreMouseEvents(Boolean(ignore), { forward: true });
  });
  ipcMain.on('panel:toggle', () => petWindow?.webContents.send('panel:toggle'));
  ipcMain.on('panel:close', () => petWindow?.webContents.send('panel:close'));
  ipcMain.handle('settings:get', () => ({
    alwaysOnTop: settings.alwaysOnTop,
    launchAtLogin: settings.launchAtLogin,
    walking: settings.walking,
    model: settings.model,
    hasApiKey: Boolean(settings.apiKey),
    reminders: settings.reminders || []
  }));
  ipcMain.handle('settings:save', (_event, next) => {
    if (typeof next.apiKey === 'string' && next.apiKey.trim()) settings.apiKey = encryptSecret(next.apiKey.trim());
    if (next.clearApiKey) settings.apiKey = '';
    if (typeof next.model === 'string' && next.model.trim()) settings.model = next.model.trim();
    if (typeof next.alwaysOnTop === 'boolean') setAlwaysOnTop(next.alwaysOnTop);
    if (typeof next.launchAtLogin === 'boolean') setLaunchAtLogin(next.launchAtLogin);
    if (typeof next.walking === 'boolean') setWalking(next.walking);
    saveSettings();
    return { ok: true, hasApiKey: Boolean(settings.apiKey) };
  });
  ipcMain.handle('reminder:add', (_event, reminder) => {
    const when = new Date(reminder.when);
    if (!reminder.text?.trim() || Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
      throw new Error('请填写提醒内容，并选择未来的时间');
    }
    settings.reminders.push({ id: randomUUID(), text: reminder.text.trim(), when: when.toISOString(), done: false });
    saveSettings();
    scheduleReminders();
    return settings.reminders;
  });
  ipcMain.handle('reminder:remove', (_event, id) => {
    settings.reminders = settings.reminders.filter((item) => item.id !== id);
    saveSettings();
    scheduleReminders();
    return settings.reminders;
  });
  ipcMain.handle('ai:ask', (_event, message) => askAI(message));
  ipcMain.handle('ai:reset', () => { previousResponseId = null; return true; });
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.openai.lunar-vow-pet');
  loadSettings();
  registerIpc();
  createPetWindow();
  createTray();
  setLaunchAtLogin(settings.launchAtLogin);
  startMotion();
  scheduleReminders();
});

app.on('window-all-closed', () => {});
app.on('before-quit', () => {
  app.isQuitting = true;
  clearInterval(motionTimer);
  clearTimeout(reminderTimer);
});

const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) app.quit();
else app.on('second-instance', () => { petWindow?.show(); petWindow?.focus(); });
