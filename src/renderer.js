const pet = document.querySelector('#pet');
const panel = document.querySelector('#panel');
const bubble = document.querySelector('#bubble');
const heart = document.querySelector('#heart');
const status = document.querySelector('#status');
const messages = document.querySelector('#messages');
let pointerDown = false;
let moved = false;
let startPoint = null;
let bubbleTimer;

function setPetState(state) {
  pet.classList.remove('idle', 'walk-left', 'walk-right', 'dragging');
  pet.classList.add(state || 'idle');
}

function say(text, timeout = 4500) {
  clearTimeout(bubbleTimer);
  bubble.textContent = text;
  bubble.classList.remove('hidden');
  bubbleTimer = setTimeout(() => bubble.classList.add('hidden'), timeout);
}

function react() {
  pet.classList.remove('reacting');
  void pet.offsetWidth;
  pet.classList.add('reacting');
  heart.classList.remove('pop');
  void heart.offsetWidth;
  heart.classList.add('pop');
  say(['嗯？我在这里。', '今天也要好好陪着我哦。', '不许悄悄溜走。', '要和我聊聊天吗？'][Math.floor(Math.random() * 4)]);
}

pet.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  pointerDown = true;
  moved = false;
  startPoint = { x: event.clientX, y: event.clientY };
  pet.setPointerCapture(event.pointerId);
  window.petAPI.dragStart({ x: event.clientX, y: event.clientY });
});

pet.addEventListener('pointermove', (event) => {
  if (!pointerDown) return;
  if (Math.hypot(event.clientX - startPoint.x, event.clientY - startPoint.y) > 5) moved = true;
  window.petAPI.dragMove({ screenX: event.screenX, screenY: event.screenY });
});

pet.addEventListener('pointerup', () => {
  if (!pointerDown) return;
  pointerDown = false;
  window.petAPI.dragEnd();
  if (!moved) react();
});

pet.addEventListener('dblclick', () => openPanel('chat'));
pet.addEventListener('contextmenu', (event) => { event.preventDefault(); openPanel('chat'); });

function openPanel(tab = 'chat') {
  panel.classList.remove('hidden');
  window.petAPI.setMousePassthrough(false);
  showTab(tab);
}

function closePanel() {
  panel.classList.add('hidden');
  window.petAPI.setMousePassthrough(true);
}

function showTab(name) {
  document.querySelectorAll('.tabs button').forEach((button) => button.classList.toggle('active', button.dataset.tab === name));
  document.querySelectorAll('.tab').forEach((tab) => tab.classList.toggle('active', tab.id === `tab-${name}`));
}

document.querySelectorAll('.tabs button').forEach((button) => button.addEventListener('click', () => showTab(button.dataset.tab)));
document.querySelector('#close-panel').addEventListener('click', closePanel);

function appendMessage(kind, text) {
  const p = document.createElement('p');
  p.className = kind;
  p.textContent = text;
  messages.appendChild(p);
  messages.scrollTop = messages.scrollHeight;
  return p;
}

document.querySelector('#chat-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = document.querySelector('#chat-input');
  const message = input.value.trim();
  if (!message) return;
  input.value = '';
  appendMessage('user', message);
  const waiting = appendMessage('assistant', '……');
  try {
    const answer = await window.petAPI.askAI(message);
    waiting.textContent = answer;
    say(answer, 6500);
  } catch (error) {
    waiting.className = 'error';
    waiting.textContent = error.message;
  }
});

function localDateTime(iso) {
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

function renderReminders(items) {
  const list = document.querySelector('#reminder-list');
  list.replaceChildren();
  items.filter((item) => !item.done).sort((a, b) => new Date(a.when) - new Date(b.when)).forEach((item) => {
    const row = document.createElement('div');
    row.className = 'reminder-item';
    const text = document.createElement('span');
    text.textContent = `${localDateTime(item.when)} · ${item.text}`;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = '删除';
    remove.addEventListener('click', async () => renderReminders(await window.petAPI.removeReminder(item.id)));
    row.append(text, remove);
    list.append(row);
  });
}

document.querySelector('#reminder-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const reminders = await window.petAPI.addReminder({
      text: document.querySelector('#reminder-text').value,
      when: document.querySelector('#reminder-when').value
    });
    renderReminders(reminders);
    event.target.reset();
    status.textContent = '提醒已保存';
  } catch (error) { status.textContent = error.message; }
});

document.querySelector('#settings-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const result = await window.petAPI.saveSettings({
      walking: document.querySelector('#walking').checked,
      alwaysOnTop: document.querySelector('#always-on-top').checked,
      launchAtLogin: document.querySelector('#launch-at-login').checked,
      model: document.querySelector('#model').value,
      apiKey: document.querySelector('#api-key').value
    });
    document.querySelector('#api-key').value = '';
    document.querySelector('#key-status').textContent = result.hasApiKey ? 'API Key 已通过系统加密保存' : '尚未设置 API Key';
    status.textContent = '设置已保存';
  } catch (error) { status.textContent = error.message; }
});

document.querySelector('#clear-key').addEventListener('click', async () => {
  const result = await window.petAPI.saveSettings({ clearApiKey: true });
  document.querySelector('#key-status').textContent = result.hasApiKey ? 'API Key 已保存' : '尚未设置 API Key';
});

async function initialize() {
  const config = await window.petAPI.getSettings();
  document.querySelector('#walking').checked = config.walking;
  document.querySelector('#always-on-top').checked = config.alwaysOnTop;
  document.querySelector('#launch-at-login').checked = config.launchAtLogin;
  document.querySelector('#model').value = config.model;
  document.querySelector('#key-status').textContent = config.hasApiKey ? 'API Key 已通过系统加密保存' : 'AI 聊天需填写自己的 OpenAI API Key';
  renderReminders(config.reminders);
  const soon = new Date(Date.now() + 10 * 60 * 1000);
  soon.setSeconds(0, 0);
  const offset = soon.getTimezoneOffset() * 60_000;
  document.querySelector('#reminder-when').value = new Date(soon.getTime() - offset).toISOString().slice(0, 16);
}

window.petAPI.onPetState(setPetState);
window.petAPI.onPetSay(say);
window.petAPI.onOpenPanel(openPanel);
window.petAPI.onTogglePanel(() => panel.classList.contains('hidden') ? openPanel('chat') : closePanel());
window.petAPI.onClosePanel(closePanel);
document.addEventListener('mousemove', (event) => {
  if (!panel.classList.contains('hidden') || pointerDown) return;
  window.petAPI.setMousePassthrough(!event.target.closest('#pet'));
});
document.addEventListener('mouseleave', () => {
  if (panel.classList.contains('hidden') && !pointerDown) window.petAPI.setMousePassthrough(true);
});
initialize();
