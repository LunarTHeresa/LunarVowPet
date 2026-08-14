import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const input = process.argv[2];
const outputDir = process.argv[3] || 'artifacts/walk-16-frames';
if (!input) throw new Error('用法：node tools/process-walk-16.mjs <sprite-sheet.png> [output-dir]');

const COLUMNS = 4;
const ROWS = 4;
const FRAME_COUNT = COLUMNS * ROWS;
const OUTPUT_WIDTH = 384;
const OUTPUT_HEIGHT = 512;
const TARGET_MAX_WIDTH = 342;
const TARGET_MAX_HEIGHT = 420;
const TARGET_BASELINE = 490;

const { data: sheet, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const totalPixels = info.width * info.height;
const background = new Uint8Array(totalPixels);
const queue = new Int32Array(totalPixels);
let head = 0;
let tail = 0;

function isBackground(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return (r + g + b) / 3 >= 221 && max - min <= 20;
}

function enqueueBackground(index) {
  if (background[index]) return;
  const offset = index * 4;
  if (!isBackground(sheet[offset], sheet[offset + 1], sheet[offset + 2])) return;
  background[index] = 1;
  queue[tail++] = index;
}

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
    const neighbours = [
      x > 0 ? index - 1 : -1,
      x + 1 < info.width ? index + 1 : -1,
      y > 0 ? index - info.width : -1,
      y + 1 < info.height ? index + info.width : -1
    ];
    for (const next of neighbours) {
      if (next < 0 || background[next] || visited[next]) continue;
      visited[next] = 1;
      work[write++] = next;
    }
  }
  if (write > 500) components.push({ size: write, minX, maxX, minY, maxY, pixels: work.slice(0, write) });
}

if (components.length < FRAME_COUNT) {
  throw new Error(`只识别到 ${components.length} 个角色主体，需要 ${FRAME_COUNT} 个`);
}

const selected = components.sort((a, b) => b.size - a.size).slice(0, FRAME_COUNT);
const frames = [];
for (let row = 0; row < ROWS; row += 1) {
  const rowCenter = (row + 0.5) * info.height / ROWS;
  const candidates = selected
    .filter((item) => Math.abs((item.minY + item.maxY) / 2 - rowCenter) < info.height / ROWS / 2)
    .sort((a, b) => a.minX - b.minX);
  if (candidates.length !== COLUMNS) {
    throw new Error(`第 ${row + 1} 行识别到 ${candidates.length} 个角色，需要 ${COLUMNS} 个`);
  }
  frames.push(...candidates);
}

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const medianWidth = median(frames.map((item) => item.maxX - item.minX + 1));
const medianHeight = median(frames.map((item) => item.maxY - item.minY + 1));
const scale = Math.min(TARGET_MAX_WIDTH / medianWidth, TARGET_MAX_HEIGHT / medianHeight);
const normalizedWidth = Math.round(medianWidth * scale);
const normalizedHeight = Math.round(medianHeight * scale);

await mkdir(outputDir, { recursive: true });
for (let frame = 0; frame < frames.length; frame += 1) {
  const component = frames[frame];
  const sourceWidth = component.maxX - component.minX + 1;
  const sourceHeight = component.maxY - component.minY + 1;
  const isolated = Buffer.alloc(sourceWidth * sourceHeight * 4);
  for (const index of component.pixels) {
    const sourceX = index % info.width;
    const sourceY = Math.floor(index / info.width);
    const targetX = sourceX - component.minX;
    const targetY = sourceY - component.minY;
    const sourceOffset = index * 4;
    const targetOffset = (targetY * sourceWidth + targetX) * 4;
    sheet.copy(isolated, targetOffset, sourceOffset, sourceOffset + 3);
    isolated[targetOffset + 3] = 255;
  }

  // Generated sheets often vary by a few pixels between cells even when the
  // intended character scale is identical. Normalizing every cell to the same
  // dimensions keeps both the head line and shoe baseline fixed, preventing
  // that tiny generation variance from becoming visible sprite jitter.
  const resizedWidth = normalizedWidth;
  const resizedHeight = normalizedHeight;
  const sprite = await sharp(isolated, { raw: { width: sourceWidth, height: sourceHeight, channels: 4 } })
    .resize(resizedWidth, resizedHeight, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer();
  const left = Math.round((OUTPUT_WIDTH - resizedWidth) / 2);
  const top = TARGET_BASELINE - resizedHeight;
  const output = join(outputDir, `walk-${String(frame).padStart(2, '0')}.png`);
  await sharp({ create: { width: OUTPUT_WIDTH, height: OUTPUT_HEIGHT, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: sprite, left, top }])
    .png()
    .toFile(output);
  console.log(`${output}: bbox ${sourceWidth}x${sourceHeight}; output ${resizedWidth}x${resizedHeight}; anchor ${left},${top}`);
}

console.log(`统一缩放 ${scale.toFixed(4)}；中位主体 ${medianWidth}x${medianHeight}`);
