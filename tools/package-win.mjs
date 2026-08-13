import packager from '@electron/packager';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const staging = await mkdtemp(join(tmpdir(), 'lunar-vow-pet-'));
const projectPackage = JSON.parse(await readFile('package.json', 'utf8'));

try {
  await cp('src', join(staging, 'src'), { recursive: true });
  await writeFile(join(staging, 'package.json'), JSON.stringify({
    name: 'lunar-vow-desktop-pet',
    version: projectPackage.version,
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
