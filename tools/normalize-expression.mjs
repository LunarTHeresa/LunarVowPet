import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import sharp from 'sharp';

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error('Usage: node tools/normalize-expression.mjs <input> <output>');

const { data, info } = await sharp(input).trim().png().toBuffer({ resolveWithObject: true });
// Match the original sprite's visible height and baseline first. A wider pose
// may use more horizontal canvas, but should not make the whole character look
// smaller when expressions switch.
const scale = Math.min(370 / info.width, 384 / info.height);
const width = Math.max(1, Math.round(info.width * scale));
const height = Math.max(1, Math.round(info.height * scale));
const left = Math.floor((384 - width) / 2);
const right = 384 - width - left;
const bottom = 22;
const top = 512 - height - bottom;

await mkdir(dirname(output), { recursive: true });
await sharp(data)
  .resize(width, height)
  .extend({
    top,
    bottom,
    left,
    right,
    background: { r: 0, g: 0, b: 0, alpha: 0 }
  })
  .png()
  .toFile(output);
