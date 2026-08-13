const status = document.querySelector('#status');
const messages = document.querySelector('#messages');
const providerPresets = {
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1-mini' },
  deepseek: { baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash' },
  gemini: { baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-3.6-flash' }
};

function showTab(name) {
  document.querySelectorAll('.tabs button').forEach((button) => button.classList.toggle('active', button.dataset.tab === name));
  document.querySelectorAll('.tab').forEach((tab) => tab.classList.toggle('active', tab.id === `tab-${name}`));
}

document.querySelectorAll('.tabs button').forEach((button) => button.addEventListener('click', () => showTab(button.dataset.tab)));
document.querySelector('#close-panel').addEventListener('click', () => window.petAPI.closePanel());
document.querySelector('#provider-preset').addEventListener('change', (event) => {
  const preset = providerPresets[event.target.value];
  if (!preset) return;
  document.querySelector('#base-url').value = preset.baseUrl;
  document.querySelector('#model').value = preset.model;
});
document.querySelector('#pet-scale').addEventListener('input', (event) => {
  document.querySelector('#scale-value').textContent = `${event.target.value}%`;
});

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
    window.petAPI.say(answer);
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
  } catch (error) {
    status.textContent = error.message;
  }
});

document.querySelector('#settings-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const result = await window.petAPI.saveSettings({
      walking: document.querySelector('#walking').checked,
      alwaysOnTop: document.querySelector('#always-on-top').checked,
      launchAtLogin: document.querySelector('#launch-at-login').checked,
      baseUrl: document.querySelector('#base-url').value,
      model: document.querySelector('#model').value,
      persona: document.querySelector('#persona').value,
      petScale: Number(document.querySelector('#pet-scale').value) / 100,
      apiKey: document.querySelector('#api-key').value
    });
    document.querySelector('#api-key').value = '';
    document.querySelector('#key-status').textContent = result.hasApiKey ? 'API Key 已通过系统加密保存' : '尚未设置 API Key';
    status.textContent = '设置已保存';
  } catch (error) {
    status.textContent = error.message;
  }
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
  document.querySelector('#base-url').value = config.baseUrl;
  document.querySelector('#model').value = config.model;
  document.querySelector('#persona').value = config.persona;
  document.querySelector('#pet-scale').value = Math.round(config.petScale * 100);
  document.querySelector('#scale-value').textContent = `${Math.round(config.petScale * 100)}%`;
  document.querySelector('#key-status').textContent = config.hasApiKey ? 'API Key 已通过系统加密保存' : '尚未设置 API Key（本地无密钥服务可留空）';
  renderReminders(config.reminders);
  const soon = new Date(Date.now() + 10 * 60 * 1000);
  soon.setSeconds(0, 0);
  const offset = soon.getTimezoneOffset() * 60_000;
  document.querySelector('#reminder-when').value = new Date(soon.getTime() - offset).toISOString().slice(0, 16);
}

window.petAPI.onOpenPanel(showTab);
initialize();
