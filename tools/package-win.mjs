import packager from '@electron/packager';
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const staging = await mkdtemp(join(tmpdir(), 'lunar-vow-pet-'));

try {
  await cp('src', join(staging, 'src'), { recursive: true });
  await writeFile(join(staging, 'package.json'), JSON.stringify({
    name: 'lunar-vow-desktop-pet',
    version: '0.1.0',
    main: 'src/main.js'
  }, null, 2));

  await packager({
    dir: staging,
    name: 'LunarVowPet',
    platform: 'win32',
    arch: 'x64',
    electronVersion: '43.4.0',
    out: 'release',
    overwrite: true,
    prune: true,
    asar: true,
    icon: 'src/assets/icon.ico'
  });
} finally {
  await rm(staging, { recursive: true, force: true });
}
