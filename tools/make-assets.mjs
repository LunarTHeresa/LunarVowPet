import sharp from 'sharp';

const master = 'src/assets/pet-master.png';
await sharp(master).trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } }).resize({ width: 620 }).png().toFile('src/assets/pet.png');
await sharp(master).trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } }).resize({ width: 64, height: 64, fit: 'contain' }).png().toFile('src/assets/tray.png');
await sharp(master).trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } }).resize({ width: 256, height: 256, fit: 'contain' }).png().toFile('src/assets/icon.png');
