const pet = document.querySelector('#pet');
const petImage = document.querySelector('#pet-image');
const petImageFade = document.querySelector('#pet-image-fade');
const bubble = document.querySelector('#bubble');
const idleSprite = 'assets/idle-v2.png';
const expressionSprites = Object.freeze({
  idle: idleSprite,
  happy: 'assets/expressions/happy.png',
  shy: 'assets/expressions/shy.png',
  curious: 'assets/expressions/curious.png',
  sleepy: 'assets/expressions/sleepy.png',
  sparkle: 'assets/expressions/sparkle.png',
  yandere: 'assets/expressions/yandere.png'
});
const expressionNames = Object.keys(expressionSprites);
let pointerDown = false;
let moved = false;
let dragStarted = false;
let startPoint = null;
let activePointerId = null;
let bubbleTimer;
let clickTimer;

for (const source of [idleSprite, ...Object.values(expressionSprites)]) {
  const image = new Image();
  image.src = source;
}

function crossfadeTo(source) {
  if (petImage.getAttribute('src') === source) return;
  petImageFade.src = petImage.src;
  petImageFade.classList.remove('crossfade-out');
  void petImageFade.offsetWidth;
  petImage.src = source;
  petImageFade.classList.add('crossfade-out');
}

function say(text, timeout = 4500) {
  clearTimeout(bubbleTimer);
  const message = String(text || '').trim();
  bubble.textContent = message;
  bubble.classList.toggle('hidden', !bubble.textContent);
  bubble.scrollTop = 0;
  if (bubble.textContent) {
    const readingTime = Math.max(timeout, Math.min(30000, 4000 + [...message].length * 120));
    bubbleTimer = setTimeout(() => bubble.classList.add('hidden'), readingTime);
  }
}

function showExpression(expression) {
  for (const name of expressionNames) pet.classList.remove(`expression-${name}`);
  const name = expressionNames.includes(expression?.name) ? expression.name : 'idle';
  pet.classList.toggle('idle', name === 'idle');
  if (name !== 'idle') pet.classList.add(`expression-${name}`);
  crossfadeTo(expressionSprites[name]);
}

pet.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  pointerDown = true;
  moved = false;
  dragStarted = false;
  activePointerId = event.pointerId;
  startPoint = { screenX: event.screenX, screenY: event.screenY };
  pet.setPointerCapture(event.pointerId);
});

pet.addEventListener('pointermove', (event) => {
  if (!pointerDown || event.pointerId !== activePointerId) return;
  if (!moved && Math.hypot(event.screenX - startPoint.screenX, event.screenY - startPoint.screenY) > 5) {
    moved = true;
    dragStarted = true;
    window.petAPI.dragStart({ x: event.clientX, y: event.clientY });
  }
});

function finishPointer(event, cancelled = false) {
  if (!pointerDown || (event?.pointerId !== undefined && event.pointerId !== activePointerId)) return;
  pointerDown = false;
  activePointerId = null;
  if (dragStarted) window.petAPI.dragEnd();
  dragStarted = false;
  if (!moved && !cancelled) {
    clearTimeout(clickTimer);
    clickTimer = setTimeout(() => window.petAPI.interact(), 220);
  }
}

pet.addEventListener('pointerup', (event) => finishPointer(event));
pet.addEventListener('pointercancel', (event) => finishPointer(event, true));
document.addEventListener('pointerup', (event) => finishPointer(event));
document.addEventListener('pointercancel', (event) => finishPointer(event, true));
pet.addEventListener('lostpointercapture', (event) => finishPointer(event, true));
window.addEventListener('blur', () => finishPointer(undefined, true));
pet.addEventListener('dblclick', () => {
  clearTimeout(clickTimer);
  window.petAPI.openPanel('chat');
});
pet.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  window.petAPI.openPanel('chat');
});

window.petAPI.onPetExpression(showExpression);
window.petAPI.onPetDragging((value) => pet.classList.toggle('dragging', value));
window.petAPI.onPetSay(say);
window.petAPI.onPetScale((scale) => document.documentElement.style.setProperty('--pet-scale', scale));

document.addEventListener('mousemove', (event) => {
  if (pointerDown) return;
  window.petAPI.setMousePassthrough(!event.target.closest('#pet, #bubble'));
});
document.addEventListener('mouseleave', () => {
  if (!pointerDown) window.petAPI.setMousePassthrough(true);
});

window.petAPI.getSettings().then((config) => {
  document.documentElement.style.setProperty('--pet-scale', config.petScale);
});
