const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, screen, Notification, safeStorage, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const BASE_PET_SIZE = { width: 210, height: 300 };
const PET_WINDOW_EXTRA = { width: 16, height: 76 };
const PANEL_SIZE = { width: 380, height: 520 };
const STEP_MS = 33;
const WALK_STEP_PIXELS = 1;
const WALK_FRAME_COUNT = 16;
const WALK_CYCLE_PIXELS = 48;
let petWindow;
let panelWindow;
let tray;
let motionTimer;
let dragTimer;
let reminderTimer;
let walking = true;
let direction = -1;
let dragging = false;
let dragOffset = { x: 0, y: 0 };
let motionPhase = 'idle';
let phaseEndsAt = 0;
let preciseX = null;
let walkDistance = 0;
let currentWalkFrame = -1;
let turnPending = false;
let settings = {};
let conversationHistory = [];

const defaults = {
  alwaysOnTop: true,
  launchAtLogin: false,
  walking: true,
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4.1-mini',
  persona: '你是用户的桌宠月下。性格温柔、亲近、略带俏皮和占有欲，会自然地关心用户。用中文简短回复，通常不超过三句话；不要声称自己能操作没有提供的系统功能。',
  petScale: 1,
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
  if (settings.model === 'gpt-5.6-luna') settings.model = defaults.model;
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

function normalizedScale(value) {
  return Math.max(0.5, Math.min(Number(value) || 1, 1.5));
}

function windowSizeForScale(value) {
  const scale = normalizedScale(value);
  return {
    width: Math.ceil(BASE_PET_SIZE.width * scale + PET_WINDOW_EXTRA.width),
    height: Math.ceil(BASE_PET_SIZE.height * scale + PET_WINDOW_EXTRA.height)
  };
}

function clampPosition(x, y, referencePoint = null) {
  const bounds = petWindow?.getBounds() || windowSizeForScale(settings.petScale);
  const display = screen.getDisplayNearestPoint(referencePoint || {
    x: Math.round(x + bounds.width / 2),
    y: Math.round(y + bounds.height / 2)
  });
  const area = display.workArea;
  return {
    x: Math.max(area.x, Math.min(x, area.x + area.width - bounds.width)),
    y: Math.max(area.y, Math.min(y, area.y + area.height - bounds.height))
  };
}

function showIdle() {
  currentWalkFrame = -1;
  petWindow?.webContents.send('pet:state', 'idle');
}

function showWalkFrame(force = false) {
  const frame = Math.floor((walkDistance % WALK_CYCLE_PIXELS) / (WALK_CYCLE_PIXELS / WALK_FRAME_COUNT));
  if (!force && frame === currentWalkFrame) return frame;
  currentWalkFrame = frame;
  petWindow?.webContents.send('pet:state', `walk-${direction < 0 ? 'left' : 'right'}-${frame}`);
  return frame;
}

function enterIdle(duration) {
  motionPhase = 'idle';
  phaseEndsAt = Date.now() + duration;
  showIdle();
}

function applyPetScale(value, persist = true) {
  const scale = normalizedScale(value);
  settings.petScale = scale;
  if (petWindow && !petWindow.isDestroyed()) {
    const old = petWindow.getBounds();
    const size = windowSizeForScale(scale);
    const area = activeWorkArea();
    const x = Math.max(area.x, Math.min(old.x + old.width - size.width, area.x + area.width - size.width));
    const y = Math.max(area.y, Math.min(old.y + old.height - size.height, area.y + area.height - size.height));
    petWindow.setBounds({ x: Math.round(x), y: Math.round(y), ...size }, false);
    preciseX = Math.round(x);
    petWindow.webContents.send('pet:scale', scale);
  }
  if (persist) saveSettings();
}

function stopDragging() {
  if (!dragging) return;
  dragging = false;
  clearInterval(dragTimer);
  dragTimer = null;
  const bounds = petWindow?.getBounds();
  preciseX = bounds?.x ?? null;
  enterIdle(1600);
}

function startDragging(point) {
  if (!petWindow) return;
  clearInterval(dragTimer);
  dragging = true;
  motionPhase = 'idle';
  currentWalkFrame = -1;
  dragOffset = { x: Number(point?.x) || 0, y: Number(point?.y) || 0 };
  petWindow.webContents.send('pet:state', 'dragging');

  const followCursor = () => {
    if (!dragging || !petWindow || petWindow.isDestroyed()) return;
    const cursor = screen.getCursorScreenPoint();
    const pos = clampPosition(cursor.x - dragOffset.x, cursor.y - dragOffset.y, cursor);
    const bounds = petWindow.getBounds();
    const nextX = Math.round(pos.x);
    const nextY = Math.round(pos.y);
    if (nextX !== bounds.x || nextY !== bounds.y) petWindow.setPosition(nextX, nextY, false);
  };

  followCursor();
  dragTimer = setInterval(followCursor, 16);
}

function createPetWindow() {
  const area = screen.getPrimaryDisplay().workArea;
  const size = windowSizeForScale(settings.petScale);
  petWindow = new BrowserWindow({
    ...size,
    x: area.x + area.width - size.width - 24,
    y: area.y + area.height - size.height,
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
  petWindow.loadFile(path.join(__dirname, 'pet.html'));
  petWindow.once('ready-to-show', () => {
    petWindow.webContents.send('pet:scale', normalizedScale(settings.petScale));
    petWindow.showInactive();
  });
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

function createPanelWindow() {
  panelWindow = new BrowserWindow({
    ...PANEL_SIZE,
    show: false,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    alwaysOnTop: settings.alwaysOnTop,
    skipTaskbar: false,
    backgroundColor: '#241025',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  panelWindow.setMenuBarVisibility(false);
  panelWindow.loadFile(path.join(__dirname, 'index.html'));
  panelWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      panelWindow.hide();
    }
  });
  panelWindow.on('hide', () => {
    enterIdle(1600);
  });
  panelWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  panelWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  panelWindow.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
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
  if (!panelWindow) return;
  const area = activeWorkArea();
  const x = Math.round(area.x + (area.width - PANEL_SIZE.width) / 2);
  const y = Math.round(area.y + (area.height - PANEL_SIZE.height) / 2);
  panelWindow.setPosition(x, y, false);
  panelWindow.show();
  panelWindow.focus();
  panelWindow.webContents.send('panel:open', tab);
  enterIdle(1600);
}

function setWalking(value) {
  walking = Boolean(value);
  settings.walking = walking;
  motionPhase = 'idle';
  phaseEndsAt = walking ? Date.now() + 1800 : Infinity;
  preciseX = petWindow?.getBounds().x ?? null;
  walkDistance = 0;
  saveSettings();
  showIdle();
  refreshTrayMenu();
}

function setAlwaysOnTop(value) {
  settings.alwaysOnTop = Boolean(value);
  petWindow?.setAlwaysOnTop(settings.alwaysOnTop);
  panelWindow?.setAlwaysOnTop(settings.alwaysOnTop);
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
  motionPhase = 'idle';
  phaseEndsAt = Date.now() + 2200;
  preciseX = petWindow?.getBounds().x ?? null;
  walkDistance = 0;
  showIdle();
  motionTimer = setInterval(() => {
    const now = Date.now();
    if (!petWindow || !petWindow.isVisible() || panelWindow?.isVisible() || dragging || !walking) return;

    if (now >= phaseEndsAt) {
      if (motionPhase === 'idle') {
        motionPhase = 'walking';
        if (turnPending) turnPending = false;
        else if (Math.random() < 0.28) direction *= -1;
        phaseEndsAt = now + 9000 + Math.random() * 9000;
        preciseX = petWindow.getBounds().x;
        walkDistance = 0;
        showWalkFrame(true);
      } else if (motionPhase === 'walking') {
        motionPhase = 'stopping';
        phaseEndsAt = Infinity;
      }
    }
    if (motionPhase !== 'walking' && motionPhase !== 'stopping') return;

    const bounds = petWindow.getBounds();
    const area = activeWorkArea();
    const minX = area.x;
    const maxX = area.x + area.width - bounds.width;
    if (preciseX === null) preciseX = bounds.x;
    preciseX += direction * WALK_STEP_PIXELS;
    if (preciseX <= minX || preciseX >= maxX) {
      preciseX = Math.max(minX, Math.min(preciseX, maxX));
      direction *= -1;
      turnPending = true;
      enterIdle(650);
      return;
    }
    const nextX = Math.round(preciseX);
    if (nextX !== bounds.x) petWindow.setPosition(nextX, bounds.y, false);
    walkDistance = (walkDistance + WALK_STEP_PIXELS) % WALK_CYCLE_PIXELS;
    const frame = showWalkFrame();
    if (motionPhase === 'stopping' && (frame === 0 || frame === WALK_FRAME_COUNT / 2)) {
      enterIdle(4500 + Math.random() * 5500);
    }
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

function chatCompletionsUrl(baseUrl) {
  const value = (baseUrl || defaults.baseUrl).trim().replace(/\/+$/, '');
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('API 地址必须以 http:// 或 https:// 开头');
  return value.endsWith('/chat/completions') ? value : `${value}/chat/completions`;
}

function extractChatText(data) {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content.map((part) => typeof part === 'string' ? part : part?.text || '').filter(Boolean).join('\n').trim();
  }
  return '';
}

async function askAI(message) {
  const apiKey = decryptSecret(settings.apiKey);
  const endpoint = chatCompletionsUrl(settings.baseUrl);
  const systemMessage = settings.persona?.trim() || defaults.persona;
  const messages = [
    { role: 'system', content: systemMessage },
    ...conversationHistory.slice(-12),
    { role: 'user', content: message }
  ];
  const body = {
    model: settings.model || defaults.model,
    messages,
    stream: false
  };
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('AI 请求超时，请检查 API 地址或网络');
    throw new Error(`无法连接 AI 服务：${error.message}`);
  } finally {
    clearTimeout(timeout);
  }
  const raw = await response.text();
  let data;
  try { data = JSON.parse(raw); } catch { data = {}; }
  if (!response.ok) throw new Error(data?.error?.message || raw.slice(0, 180) || `请求失败 (${response.status})`);
  const answer = extractChatText(data);
  if (!answer) throw new Error('AI 服务返回了无法识别的响应格式');
  conversationHistory = [...conversationHistory, { role: 'user', content: message }, { role: 'assistant', content: answer }].slice(-12);
  return answer;
}

function registerIpc() {
  ipcMain.on('drag:start', (_event, point) => startDragging(point));
  ipcMain.on('drag:end', stopDragging);
  ipcMain.on('mouse:passthrough', (_event, ignore) => {
    petWindow?.setIgnoreMouseEvents(Boolean(ignore), { forward: true });
  });
  ipcMain.on('panel:open-request', (_event, tab) => openPanel(tab));
  ipcMain.on('pet:say-request', (_event, message) => petWindow?.webContents.send('pet:say', String(message || '')));
  ipcMain.on('panel:toggle', () => panelWindow?.isVisible() ? panelWindow.hide() : openPanel('chat'));
  ipcMain.on('panel:close', () => panelWindow?.hide());
  ipcMain.handle('settings:get', () => ({
    alwaysOnTop: settings.alwaysOnTop,
    launchAtLogin: settings.launchAtLogin,
    walking: settings.walking,
    baseUrl: settings.baseUrl,
    model: settings.model,
    persona: settings.persona || defaults.persona,
    petScale: normalizedScale(settings.petScale),
    hasApiKey: Boolean(settings.apiKey),
    reminders: settings.reminders || []
  }));
  ipcMain.handle('settings:save', (_event, next) => {
    if (typeof next.apiKey === 'string' && next.apiKey.trim()) settings.apiKey = encryptSecret(next.apiKey.trim());
    if (next.clearApiKey) settings.apiKey = '';
    if (typeof next.baseUrl === 'string' && next.baseUrl.trim()) {
      chatCompletionsUrl(next.baseUrl);
      settings.baseUrl = next.baseUrl.trim().replace(/\/+$/, '');
    }
    if (typeof next.model === 'string' && next.model.trim()) settings.model = next.model.trim();
    if (typeof next.persona === 'string') settings.persona = next.persona.trim() || defaults.persona;
    if (typeof next.alwaysOnTop === 'boolean') setAlwaysOnTop(next.alwaysOnTop);
    if (typeof next.launchAtLogin === 'boolean') setLaunchAtLogin(next.launchAtLogin);
    if (typeof next.walking === 'boolean') setWalking(next.walking);
    if (next.petScale !== undefined) applyPetScale(next.petScale, false);
    conversationHistory = [];
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
  ipcMain.handle('ai:reset', () => { conversationHistory = []; return true; });
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.openai.lunar-vow-pet');
  loadSettings();
  registerIpc();
  createPetWindow();
  createPanelWindow();
  createTray();
  setLaunchAtLogin(settings.launchAtLogin);
  startMotion();
  scheduleReminders();
});

app.on('window-all-closed', () => {});
app.on('before-quit', () => {
  app.isQuitting = true;
  clearInterval(motionTimer);
  clearInterval(dragTimer);
  clearTimeout(reminderTimer);
});

const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) app.quit();
else app.on('second-instance', () => { petWindow?.show(); petWindow?.focus(); });
