const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, screen, Notification, safeStorage, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { EXPRESSIONS, expressionByName, createExpressionPicker } = require('./expressions');
const { normalizedScale, windowSizeForScale } = require('./pet-layout');

const PANEL_SIZE = { width: 380, height: 520 };
const pickNextExpression = createExpressionPicker();
let petWindow;
let panelWindow;
let tray;
let dragTimer;
let reminderTimer;
let displayRecoveryTimer;
let dragging = false;
let dragOffset = { x: 0, y: 0 };
let previousExpression = '';
let interactionPending = false;
let settings = {};
let conversationHistory = [];

const defaults = {
  alwaysOnTop: true,
  launchAtLogin: false,
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
  delete settings.walking;
  delete settings.quietMode;
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

function sendExpression(expression, speak = true) {
  if (!petWindow || petWindow.isDestroyed() || petWindow.webContents.isDestroyed()) return;
  previousExpression = expression.name;
  petWindow.webContents.send('pet:expression', expression);
  if (speak && expression.line) petWindow.webContents.send('pet:say', expression.line);
}

function sendPetSay(message) {
  if (!petWindow || petWindow.isDestroyed() || petWindow.webContents.isDestroyed()) return;
  petWindow.webContents.send('pet:say', String(message || ''));
}

function showNamedExpression(name, speak = false) {
  const expression = expressionByName(name);
  sendExpression(expression, speak);
  return expression;
}

function showRandomExpression(speak = true) {
  const expression = pickNextExpression(previousExpression);
  sendExpression(expression, speak);
  return expression;
}

function recoverPetPosition() {
  if (!petWindow || petWindow.isDestroyed()) return;
  if (dragging) {
    followCursor();
    return;
  }
  const bounds = petWindow.getBounds();
  const position = clampPosition(bounds.x, bounds.y);
  const nextX = Math.round(position.x);
  const nextY = Math.round(position.y);
  if (nextX !== bounds.x || nextY !== bounds.y) petWindow.setPosition(nextX, nextY, false);
}

function scheduleDisplayRecovery() {
  clearTimeout(displayRecoveryTimer);
  displayRecoveryTimer = setTimeout(() => {
    recoverPetPosition();
  }, 100);
}

function resizePetWindow(value) {
  const scale = normalizedScale(value);
  if (petWindow && !petWindow.isDestroyed()) {
    const old = petWindow.getBounds();
    const size = windowSizeForScale(scale);
    const area = activeWorkArea();
    const x = Math.max(area.x, Math.min(old.x + old.width - size.width, area.x + area.width - size.width));
    const y = Math.max(area.y, Math.min(old.y + old.height - size.height, area.y + area.height - size.height));
    petWindow.setBounds({ x: Math.round(x), y: Math.round(y), ...size }, false);
    petWindow.webContents.send('pet:scale', scale);
  }
  return scale;
}

function applyPetScale(value, persist = true) {
  settings.petScale = resizePetWindow(value);
  if (persist) saveSettings();
}

function stopDragging() {
  if (!dragging) return;
  dragging = false;
  clearInterval(dragTimer);
  dragTimer = undefined;
  if (petWindow && !petWindow.isDestroyed() && !petWindow.webContents.isDestroyed()) {
    petWindow.webContents.send('pet:dragging', false);
  }
}

function startDragging(point) {
  if (!petWindow || petWindow.isDestroyed()) return;
  if (dragging) return;
  dragging = true;
  const bounds = petWindow.getBounds();
  dragOffset = {
    x: Math.max(0, Math.min(Number(point?.x) || 0, bounds.width)),
    y: Math.max(0, Math.min(Number(point?.y) || 0, bounds.height))
  };
  petWindow.webContents.send('pet:dragging', true);
  followCursor();
  dragTimer = setInterval(followCursor, 16);
}

function followCursor() {
  if (!dragging || !petWindow || petWindow.isDestroyed()) return;
  const cursor = screen.getCursorScreenPoint();
  const pos = clampPosition(cursor.x - dragOffset.x, cursor.y - dragOffset.y, cursor);
  const bounds = petWindow.getBounds();
  const nextX = Math.round(pos.x);
  const nextY = Math.round(pos.y);
  if (nextX !== bounds.x || nextY !== bounds.y) petWindow.setPosition(nextX, nextY, false);
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
      sandbox: true,
      backgroundThrottling: false
    }
  });
  petWindow.setMenuBarVisibility(false);
  petWindow.webContents.on('did-finish-load', () => {
    petWindow.webContents.send('pet:scale', normalizedScale(settings.petScale));
  });
  petWindow.once('ready-to-show', () => {
    petWindow.showInactive();
  });
  petWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      petWindow.hide();
    }
  });
  petWindow.on('hide', () => {
    if (dragging) stopDragging();
    refreshTrayMenu();
  });
  petWindow.on('show', () => {
    recoverPetPosition();
    refreshTrayMenu();
  });
  petWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  petWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  petWindow.webContents.on('render-process-gone', () => {
    if (dragging) stopDragging();
  });
  petWindow.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  petWindow.loadFile(path.join(__dirname, 'pet.html'));
}

function createPanelWindow() {
  panelWindow = new BrowserWindow({
    ...PANEL_SIZE,
    minWidth: PANEL_SIZE.width,
    maxWidth: PANEL_SIZE.width,
    minHeight: PANEL_SIZE.height,
    maxHeight: PANEL_SIZE.height,
    show: false,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    useContentSize: true,
    alwaysOnTop: settings.alwaysOnTop,
    skipTaskbar: false,
    backgroundColor: '#241025',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      zoomFactor: 1
    }
  });
  panelWindow.setMenuBarVisibility(false);
  panelWindow.loadFile(path.join(__dirname, 'index.html'));
  panelWindow.webContents.on('did-finish-load', () => {
    panelWindow.webContents.setZoomFactor(1);
    panelWindow.webContents.setVisualZoomLevelLimits(1, 1);
  });
  panelWindow.on('will-resize', (event) => event.preventDefault());
  panelWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      panelWindow.hide();
    }
  });
  panelWindow.on('hide', () => resizePetWindow(settings.petScale));
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
    { label: '换个表情', click: () => { petWindow?.showInactive(); showRandomExpression(false); } },
    {
      label: '指定表情',
      submenu: EXPRESSIONS.map((expression) => ({
        label: expression.label,
        click: () => { petWindow?.showInactive(); showNamedExpression(expression.name, false); }
      }))
    },
    { label: '让月下说句话', click: () => { petWindow?.showInactive(); void handlePetInteraction(); } },
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
  panelWindow.setBounds({ x, y, ...PANEL_SIZE }, false);
  panelWindow.webContents.setZoomFactor(1);
  panelWindow.show();
  panelWindow.focus();
  panelWindow.webContents.send('panel:open', tab);
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

async function askAI(message, { remember = true } = {}) {
  const apiKey = decryptSecret(settings.apiKey);
  const endpoint = chatCompletionsUrl(settings.baseUrl);
  const systemMessage = settings.persona?.trim() || defaults.persona;
  const messages = [
    { role: 'system', content: systemMessage },
    ...(remember ? conversationHistory.slice(-12) : []),
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
  if (remember) {
    conversationHistory = [...conversationHistory, { role: 'user', content: message }, { role: 'assistant', content: answer }].slice(-12);
  }
  return answer;
}

function hasConfiguredAI() {
  return Boolean(settings.apiKey)
    || settings.baseUrl !== defaults.baseUrl
    || settings.model !== defaults.model;
}

function interactionContext(expression) {
  const now = new Date();
  const localTime = new Intl.DateTimeFormat('zh-CN', {
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit'
  }).format(now);
  const upcoming = (settings.reminders || [])
    .filter((reminder) => !reminder.done && new Date(reminder.when).getTime() > now.getTime())
    .sort((a, b) => new Date(a.when) - new Date(b.when))[0];
  const reminderContext = upcoming
    ? `用户最近的一项待办提醒是“${upcoming.text}”。`
    : '当前没有即将到来的本地提醒。';
  return [
    '这是桌宠被用户单击后的即时互动，不是聊天面板中的正式提问。',
    `当前本地时间是${localTime}，你此刻表现出的情绪是“${expression.label}”。`,
    reminderContext,
    '请结合时间、情绪和被用户轻点这件事，以月下的人设直接回应一句自然中文。',
    '只输出会说出口的话，不要解释、不加引号或动作括号，控制在10到40个汉字，并尽量避免与之前固定台词相同。'
  ].join('\n');
}

async function handlePetInteraction() {
  if (interactionPending || dragging) return;
  const expression = showRandomExpression(false);
  if (!hasConfiguredAI()) {
    sendPetSay(expression.line);
    return;
  }
  interactionPending = true;
  try {
    const answer = await askAI(interactionContext(expression), { remember: false });
    sendPetSay(answer);
  } catch (error) {
    console.error('Pet interaction AI failed:', error);
    sendPetSay(`API 暂时没有回应。${expression.line}`);
  } finally {
    interactionPending = false;
  }
}

function registerIpc() {
  ipcMain.on('drag:start', (event, point) => {
    if (event.sender === petWindow?.webContents) startDragging(point);
  });
  ipcMain.on('drag:end', (event) => {
    if (event.sender === petWindow?.webContents) stopDragging();
  });
  ipcMain.on('pet:interact', (event) => {
    if (event.sender === petWindow?.webContents) void handlePetInteraction();
  });
  ipcMain.on('mouse:passthrough', (event, ignore) => {
    if (event.sender !== petWindow?.webContents) return;
    petWindow?.setIgnoreMouseEvents(Boolean(ignore), { forward: true });
  });
  ipcMain.on('panel:open-request', (_event, tab) => openPanel(tab));
  ipcMain.on('pet:say-request', (_event, message) => petWindow?.webContents.send('pet:say', String(message || '')));
  ipcMain.on('panel:toggle', () => panelWindow?.isVisible() ? panelWindow.hide() : openPanel('chat'));
  ipcMain.on('panel:close', () => panelWindow?.hide());
  ipcMain.on('pet:scale-preview', (event, value) => {
    if (event.sender === panelWindow?.webContents) resizePetWindow(value);
  });
  ipcMain.handle('settings:get', () => ({
    alwaysOnTop: settings.alwaysOnTop,
    launchAtLogin: settings.launchAtLogin,
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
  screen.on('display-added', scheduleDisplayRecovery);
  screen.on('display-removed', scheduleDisplayRecovery);
  screen.on('display-metrics-changed', scheduleDisplayRecovery);
  setLaunchAtLogin(settings.launchAtLogin);
  scheduleReminders();
});

app.on('window-all-closed', () => {});
app.on('before-quit', () => {
  app.isQuitting = true;
  clearInterval(dragTimer);
  clearTimeout(reminderTimer);
  clearTimeout(displayRecoveryTimer);
});

const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) app.quit();
else app.on('second-instance', () => { petWindow?.show(); petWindow?.focus(); });
