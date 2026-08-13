import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const input = process.argv[2];
const outputDir = process.argv[3] || 'src/assets/walk';
if (!input) throw new Error('用法：node tools/process-walk-sprites.mjs <sprite-sheet.png> [output-dir]');

const { data: sheet, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const outputWidth = Math.round(info.width / 4);
const outputHeight = Math.round(info.height / 2);
const targetBaseline = outputHeight - 22;
await mkdir(outputDir, { recursive: true });

function isBackground(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return (r + g + b) / 3 >= 222 && max - min <= 18;
}

const totalPixels = info.width * info.height;
const background = new Uint8Array(totalPixels);
const queue = new Int32Array(totalPixels);
let head = 0;
let tail = 0;
const enqueueBackground = (index) => {
  if (background[index]) return;
  const offset = index * 4;
  if (!isBackground(sheet[offset], sheet[offset + 1], sheet[offset + 2])) return;
  background[index] = 1;
  queue[tail++] = index;
};

for (let x = 0; x < info.width; x += 1) {
  enqueueBackground(x);
  enqueueBackground((info.height - 1) * info.width + x);
}
for (let y = 0; y < info.height; y += 1) {
  enqueueBackground(y * info.width);
  enqueueBackground(y * info.width + info.width - 1);
}
while (head < tail) {
  const index = queue[head++];
  const x = index % info.width;
  const y = Math.floor(index / info.width);
  if (x > 0) enqueueBackground(index - 1);
  if (x + 1 < info.width) enqueueBackground(index + 1);
  if (y > 0) enqueueBackground(index - info.width);
  if (y + 1 < info.height) enqueueBackground(index + info.width);
}

// Detect connected foreground subjects globally. The eight biggest components
// are the eight complete characters; tiny detached arcs are generation debris.
const visited = new Uint8Array(totalPixels);
const work = new Int32Array(totalPixels);
const components = [];
for (let start = 0; start < totalPixels; start += 1) {
  if (background[start] || visited[start]) continue;
  let read = 0;
  let write = 0;
  let minX = info.width;
  let maxX = -1;
  let minY = info.height;
  let maxY = -1;
  visited[start] = 1;
  work[write++] = start;
  while (read < write) {
    const index = work[read++];
    const x = index % info.width;
    const y = Math.floor(index / info.width);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    for (const next of [x > 0 ? index - 1 : -1, x + 1 < info.width ? index + 1 : -1, y > 0 ? index - info.width : -1, y + 1 < info.height ? index + info.width : -1]) {
      if (next < 0 || background[next] || visited[next]) continue;
      visited[next] = 1;
      work[write++] = next;
    }
  }
  if (write > 1000) components.push({ size: write, minX, maxX, minY, maxY, pixels: work.slice(0, write) });
}

if (components.length < 8) throw new Error(`只识别到 ${components.length} 个角色主体，需要 8 个`);
const frames = components
  .sort((a, b) => b.size - a.size)
  .slice(0, 8)
  .sort((a, b) => {
    const rowA = (a.minY + a.maxY) / 2 < info.height / 2 ? 0 : 1;
    const rowB = (b.minY + b.maxY) / 2 < info.height / 2 ? 0 : 1;
    return rowA - rowB || a.minX - b.minX;
  });

for (let frame = 0; frame < frames.length; frame += 1) {
  const component = frames[frame];
  const shiftX = Math.round(outputWidth / 2 - (component.minX + component.maxX) / 2);
  const shiftY = targetBaseline - component.maxY;
  const aligned = Buffer.alloc(outputWidth * outputHeight * 4);
  for (const index of component.pixels) {
    const sourceX = index % info.width;
    const sourceY = Math.floor(index / info.width);
    const targetX = sourceX + shiftX;
    const targetY = sourceY + shiftY;
    if (targetX < 0 || targetX >= outputWidth || targetY < 0 || targetY >= outputHeight) continue;
    const source = index * 4;
    const target = (targetY * outputWidth + targetX) * 4;
    sheet.copy(aligned, target, source, source + 3);
    aligned[target + 3] = 255;
  }

  const output = join(outputDir, `walk-${frame}.png`);
  await sharp(aligned, { raw: { width: outputWidth, height: outputHeight, channels: 4 } }).png().toFile(output);
  console.log(`${output}: ${component.size} pixels; bbox ${component.minX},${component.minY}-${component.maxX},${component.maxY}; shift ${shiftX},${shiftY}`);
}
