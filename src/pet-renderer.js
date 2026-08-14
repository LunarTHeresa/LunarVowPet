const pet = document.querySelector('#pet');
const petImage = document.querySelector('#pet-image');
const bubble = document.querySelector('#bubble');
const heart = document.querySelector('#heart');
let pointerDown = false;
let moved = false;
let startPoint = null;
let activePointerId = null;
let bubbleTimer;
let walkFrame = 0;
const idleFrame = 'assets/idle-v2.png';
const walkFrames = Array.from({ length: 16 }, (_, index) => `assets/walk-16/walk-${String(index).padStart(2, '0')}.png`);

for (const source of [idleFrame, ...walkFrames]) {
  const image = new Image();
  image.src = source;
}

function showWalkFrame(index) {
  walkFrame = (index + walkFrames.length) % walkFrames.length;
  petImage.src = walkFrames[walkFrame];
}

function setPetState(state) {
  pet.classList.remove('idle', 'walk-left', 'walk-right', 'dragging');
  const nextState = state || 'idle';
  const walk = /^walk-(left|right)-(\d+)$/.exec(nextState);
  if (walk) {
    pet.classList.add(`walk-${walk[1]}`);
    showWalkFrame(Number(walk[2]));
    return;
  }
  pet.classList.add(nextState === 'dragging' ? 'dragging' : 'idle');
  petImage.src = idleFrame;
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
  activePointerId = event.pointerId;
  startPoint = { screenX: event.screenX, screenY: event.screenY };
  pet.setPointerCapture(event.pointerId);
  window.petAPI.dragStart({ x: event.clientX, y: event.clientY });
});

pet.addEventListener('pointermove', (event) => {
  if (!pointerDown || event.pointerId !== activePointerId) return;
  if (Math.hypot(event.screenX - startPoint.screenX, event.screenY - startPoint.screenY) > 5) moved = true;
});

function finishPointer(event, cancelled = false) {
  if (!pointerDown || (event?.pointerId !== undefined && event.pointerId !== activePointerId)) return;
  pointerDown = false;
  activePointerId = null;
  window.petAPI.dragEnd();
  if (!moved && !cancelled) react();
}

pet.addEventListener('pointerup', (event) => finishPointer(event));
pet.addEventListener('pointercancel', (event) => finishPointer(event, true));
document.addEventListener('pointerup', (event) => finishPointer(event));
document.addEventListener('pointercancel', (event) => finishPointer(event, true));
pet.addEventListener('dblclick', () => window.petAPI.openPanel('chat'));
pet.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  window.petAPI.openPanel('chat');
});

window.petAPI.onPetState(setPetState);
window.petAPI.onPetSay(say);
window.petAPI.onPetScale((scale) => document.documentElement.style.setProperty('--pet-scale', scale));

document.addEventListener('mousemove', (event) => {
  if (pointerDown) return;
  window.petAPI.setMousePassthrough(!event.target.closest('#pet'));
});
document.addEventListener('mouseleave', () => {
  if (!pointerDown) window.petAPI.setMousePassthrough(true);
});

window.petAPI.getSettings().then((config) => {
  document.documentElement.style.setProperty('--pet-scale', config.petScale);
});
