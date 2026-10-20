/**
 * РћРґРЅРѕРєСЂР°С‚РЅР°СЏ Р·Р°РїРµС‡РєР° С‚РѕС‡РµРє РїРѕ СЂРµР°Р»СЊРЅРѕР№ РіСЂР°РІРёСЂРѕРІРєРµ РјР°СЃРєРё.
 *
 * Р—Р°РїСѓСЃРє (РЅСѓР¶РµРЅ Р·Р°РїСѓС‰РµРЅРЅС‹Р№ npm run dev):
 *   node scripts/bake-engraving.mjs
 *
 * РЎРєСЂРёРїС‚ СЃС‚Р°РІРёС‚ СЃС†РµРЅСѓ РІ С„РёРЅР°Р»СЊРЅС‹Р№ СЂР°РєСѓСЂСЃ, Р·Р°РјРѕСЂР°Р¶РёРІР°РµС‚ РјР°СЃРєСѓ, РґРµР»Р°РµС‚
 * СЃРєСЂРёРЅС€РѕС‚ РІ 2x Рё Р±РµСЂС‘С‚ СЏСЂРєРёРµ Р±Р»РёРєРё СЂРµР»СЊРµС„Р°. Р—Р°С‚РµРј СЌРєСЂР°РЅРЅС‹Рµ С‚РѕС‡РєРё
 * РїСЂРѕРµС†РёСЂСѓСЋС‚СЃСЏ РЅР° РїРѕРІРµСЂС…РЅРѕСЃС‚СЊ РјР°СЃРєРё Рё СЃРѕС…СЂР°РЅСЏСЋС‚СЃСЏ РІ
 * src/text/engraving-points.js.
 */

import { chromium } from 'playwright';
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';

const URL = 'http://localhost:5173/wed-site/?bake=engraving';
const SCREENSHOT = 'scripts/renders/engraving-bake.png';
const DEBUG = 'scripts/renders/engraving-bake-points.png';
const OUTPUT = 'src/text/engraving-points.js';

const DPR = 1;
// РћР±Р»Р°СЃС‚СЊ РіСЂР°РІРёСЂРѕРІРєРё РІ СЃРєСЂРёРЅС€РѕС‚Рµ 1440Г—900 @2x.
const CROP = { left: 560, top: 280, width: 470, height: 430 };
const MAX_POINTS = 1800;
const BLUR_SIGMA = 5;
const RESIDUAL_THRESHOLD = 5;

function mulberry32(seed) {
  let value = seed >>> 0;
  return function random() {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

await mkdir('scripts/renders', { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: DPR,
});
const page = await context.newPage();
await page.goto(URL);
await page.waitForTimeout(5200);

await page.evaluate(() => {
  const max = document.getElementById('scene-track').offsetHeight - window.innerHeight;
  window.__wedding.scroll.lenis.scrollTo(max * 0.8, { immediate: true, force: true });
});
await page.waitForTimeout(1400);

await page.evaluate(() => {
  const debug = window.__wedding.scene.__debug;
  const constellation = debug.getConstellation();
  if (constellation) constellation.group.visible = false;
  debug.freeze();
});
await page.waitForTimeout(500);

await page.screenshot({ path: SCREENSHOT, type: 'png', timeout: 120000, animations: 'disabled' });

const base = sharp(SCREENSHOT).extract(CROP).greyscale();
const original = await base.clone().raw().toBuffer({ resolveWithObject: true });
const blurred = await base.clone().blur(BLUR_SIGMA).raw().toBuffer({
  resolveWithObject: true,
});

const { data: source, info } = original;
const { data: smooth } = blurred;
const candidates = [];
const residuals = [];

for (let y = 2; y < info.height - 2; y += 1) {
  for (let x = 2; x < info.width - 2; x += 1) {
    const index = y * info.width + x;
    const residual = source[index] - smooth[index];
    if (residual > 0) residuals.push(residual);
    if (residual >= RESIDUAL_THRESHOLD) {
      candidates.push(x, y, residual);
    }
  }
}

residuals.sort((a, b) => a - b);
const percentile = (p) => residuals[Math.floor((residuals.length - 1) * p)] ?? 0;
console.log(
  'residuals p50/p90/p99/max:',
  percentile(0.5),
  percentile(0.9),
  percentile(0.99),
  residuals.at(-1),
);
console.log('candidates:', candidates.length / 3);

const count = candidates.length / 3;
if (!count) throw new Error('РќРµ РЅР°Р№РґРµРЅРѕ С‚РѕС‡РµРє РіСЂР°РІРёСЂРѕРІРєРё');

const random = mulberry32(20261101);
const order = new Uint32Array(count);
for (let i = 0; i < count; i += 1) order[i] = i;
const take = Math.min(MAX_POINTS, count);
for (let i = 0; i < take; i += 1) {
  const j = i + Math.floor(random() * (count - i));
  const temp = order[i];
  order[i] = order[j];
  order[j] = temp;
}

const screenPoints = [];
const svgDots = [];
for (let i = 0; i < take; i += 1) {
  const index = order[i] * 3;
  const x = CROP.left + candidates[index];
  const y = CROP.top + candidates[index + 1];
  // Убираем блик верхней кромки маски, случайно попавший в кадр.
  if (y < 380 && x > 900) continue;
  screenPoints.push([x / DPR, y / DPR]);
  svgDots.push(`<circle cx="${x}" cy="${y}" r="2.2" fill="#d94a3a" fill-opacity="0.72"/>`);
}

const metadata = await sharp(SCREENSHOT).metadata();
const overlay = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${metadata.width}" height="${metadata.height}">${svgDots.join('')}</svg>`,
);
await sharp(SCREENSHOT)
  .composite([{ input: overlay, top: 0, left: 0 }])
  .png()
  .toFile(DEBUG);

const localPoints = await page.evaluate(
  (points) => window.__wedding.scene.__debug.localPointsFromScreen(points),
  screenPoints,
);

await browser.close();

console.log('surface points:', localPoints.length);
if (!localPoints.length) throw new Error('РўРѕС‡РєРё РЅРµ СЃРїСЂРѕРµС†РёСЂРѕРІР°Р»РёСЃСЊ РЅР° РјР°СЃРєСѓ');

const numbers = localPoints
  .map(([x, y, z]) => [x.toFixed(5), y.toFixed(5), z.toFixed(5)].join(', '))
  .join(',\n  ');

const content = `// Autogenerated by scripts/bake-engraving.mjs.\n// Local-space points sampled from the actual engraved relief of the mask.\nexport const ENGRAVING_POINTS = new Float32Array([\n  ${numbers},\n]);\n`;
await writeFile(OUTPUT, content, 'utf8');
console.log(`written ${OUTPUT}: ${localPoints.length} points`);




