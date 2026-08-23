import { access } from 'node:fs/promises';
import sharp from 'sharp';

const names = ['happy', 'shy', 'curious', 'sleepy', 'sparkle', 'yandere'];

for (const name of names) {
  const file = `src/assets/expressions/${name}.png`;
  await access(file);
  const metadata = await sharp(file).metadata();
  if (metadata.width !== 384 || metadata.height !== 512 || !metadata.hasAlpha) {
    throw new Error(`${file} must be a 384x512 PNG with alpha`);
  }
  const { info } = await sharp(file).trim().toBuffer({ resolveWithObject: true });
  const top = -info.trimOffsetTop;
  const bottom = 512 - top - info.height;
  if (info.height !== 384 || top !== 106 || bottom !== 22) {
    throw new Error(`${file} must use the shared 384px visible height and 22px foot baseline`);
  }
}

console.log(`Validated ${names.length} expression sprites`);
