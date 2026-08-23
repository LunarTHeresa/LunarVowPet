import sharp from 'sharp';

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  throw new Error('Usage: node tools/extract-alpha.mjs <input> <output>');
}

const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height, channels } = info;
const count = width * height;
const background = new Uint8Array(count);
const queue = new Int32Array(count);
let head = 0;
let tail = 0;
const cornerSamples = [0, width - 1, (height - 1) * width, count - 1];
const cornerBrightness = cornerSamples.reduce((sum, index) => {
  const offset = index * channels;
  return sum + Math.max(data[offset], data[offset + 1], data[offset + 2]);
}, 0) / cornerSamples.length;
const darkBackground = cornerBrightness < 40;

function isBackgroundCandidate(index) {
  const offset = index * channels;
  const r = data[offset];
  const g = data[offset + 1];
  const b = data[offset + 2];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  // Generated sprites may contain either a baked neutral checkerboard or a
  // solid black backdrop. Only flood pixels connected to the canvas edge, so
  // enclosed hair, eyes and costume details remain intact.
  if (darkBackground) return max <= 18 && max - min <= 12;
  return max >= 170 && max - min <= 28;
}

function enqueue(index) {
  if (!background[index] && isBackgroundCandidate(index)) {
    background[index] = 1;
    queue[tail++] = index;
  }
}

for (let x = 0; x < width; x += 1) {
  enqueue(x);
  enqueue((height - 1) * width + x);
}
for (let y = 0; y < height; y += 1) {
  enqueue(y * width);
  enqueue(y * width + width - 1);
}

while (head < tail) {
  const index = queue[head++];
  const x = index % width;
  const y = Math.floor(index / width);
  if (x > 0) enqueue(index - 1);
  if (x + 1 < width) enqueue(index + 1);
  if (y > 0) enqueue(index - width);
  if (y + 1 < height) enqueue(index + width);
}

for (let i = 0; i < count; i += 1) {
  if (background[i]) data[i * channels + 3] = 0;
}

await sharp(data, { raw: info }).png().toFile(output);
