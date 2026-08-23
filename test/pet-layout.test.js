const test = require('node:test');
const assert = require('node:assert/strict');
const { BUBBLE_LAYOUT, windowSizeForScale, bubbleRoomForScale } = require('../src/pet-layout');

test('pet window fully contains the long-reply bubble at every supported scale', () => {
  for (const scale of [0.5, 1, 1.5]) {
    const size = windowSizeForScale(scale);
    const room = bubbleRoomForScale(scale);
    assert.ok(size.width > 0 && size.height > 0);
    assert.ok(room.width >= BUBBLE_LAYOUT.maxWidth, `bubble width is clipped at ${scale}x`);
    assert.ok(room.height >= BUBBLE_LAYOUT.maxHeight, `bubble height is clipped at ${scale}x`);
  }
});

test('invalid scale values still reserve a complete bubble area', () => {
  for (const value of [Number.NaN, -10, 10, undefined]) {
    const room = bubbleRoomForScale(value);
    assert.ok(room.width >= BUBBLE_LAYOUT.maxWidth);
    assert.ok(room.height >= BUBBLE_LAYOUT.maxHeight);
  }
});
