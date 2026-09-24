/**
 * Mini App statik fayllarini `dist/` ga ko'chiradi.
 *
 * `tsc` faqat `.ts` fayllarni kompilyatsiya qiladi — `index.html`, `app.js` va
 * `style.css` o'z-o'zidan `dist/` ga tushmaydi. Ularsiz Railway'da Mini App
 * 404 qaytaradi va haydovchi kamerani ocha olmaydi. Shu sababli bu qadam
 * build ning ajralmas qismi.
 */
import { cpSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const ASSET_DIRS = Object.freeze([
  { from: join('src', 'web', 'public'), to: join('dist', 'web', 'public'), required: true },
]);

const copyAssets = () => {
  const copied = [];

  for (const asset of ASSET_DIRS) {
    const source = join(projectRoot, asset.from);
    const target = join(projectRoot, asset.to);

    if (!existsSync(source)) {
      if (asset.required) {
        throw new Error(`Statik fayllar topilmadi: ${asset.from}`);
      }
      continue;
    }

    cpSync(source, target, { recursive: true });
    copied.push({ path: asset.to, files: readdirSync(target) });
  }

  return copied;
};

try {
  const results = copyAssets();
  for (const result of results) {
    console.log(`✔ ${result.path} — ${result.files.join(', ')}`);
  }
} catch (error) {
  console.error(`✖ Statik fayllarni ko'chirib bo'lmadi: ${error.message}`);
  process.exit(1);
}
