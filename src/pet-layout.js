const BASE_PET_SIZE = Object.freeze({ width: 210, height: 300 });
const PET_WINDOW_MIN_WIDTH = 344;
const PET_WINDOW_EXTRA = Object.freeze({ width: 16, height: 220 });
const BUBBLE_LAYOUT = Object.freeze({
  horizontalInsets: 24,
  bottomAtScale: 292,
  maxWidth: 320,
  maxHeight: 204
});

function normalizedScale(value) {
  return Math.max(0.5, Math.min(Number(value) || 1, 1.5));
}

function windowSizeForScale(value) {
  const scale = normalizedScale(value);
  return {
    width: Math.max(PET_WINDOW_MIN_WIDTH, Math.ceil(BASE_PET_SIZE.width * scale + PET_WINDOW_EXTRA.width)),
    height: Math.ceil(BASE_PET_SIZE.height * scale + PET_WINDOW_EXTRA.height)
  };
}

function bubbleRoomForScale(value) {
  const scale = normalizedScale(value);
  const size = windowSizeForScale(scale);
  return {
    width: size.width - BUBBLE_LAYOUT.horizontalInsets,
    height: size.height - BUBBLE_LAYOUT.bottomAtScale * scale
  };
}

module.exports = { BUBBLE_LAYOUT, normalizedScale, windowSizeForScale, bubbleRoomForScale };
