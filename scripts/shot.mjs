/**
 * Быстрые скриншоты сцены для визуальной проверки.
 *
 *   node scripts/shot.mjs [--url=http://localhost:5173/wed-site/] [--tag=name]
 *                        [--w=390] [--h=844] [--p=0.84] [--wait=8000]
 */

import { chromium } from 'playwright';

const args = Object.fromEntries(
  process.argv.slice(2).map((item) => {
    const [key, value = 'true'] = item.replace(/^--/, '').split('=');
    return [key, value];
  }),
);

const url = args.url ?? 'http://localhost:5173/wed-site/?v=shot';
const tag = args.tag ?? 'shot';
const width = Number(args.w ?? 390);
const height = Number(args.h ?? 844);
const wait = Number(args.wait ?? 8000);
const positions = (args.p ?? '0.66,0.76,0.84')
  .split(',')
  .map((value) => Number(value.trim()));

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width, height },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
const errors = [];
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));

await page.goto(url);
await page.waitForTimeout(wait);

for (const position of positions) {
  await page.evaluate((progress) => {
    const max = document.getElementById('scene-track').offsetHeight - window.innerHeight;
    window.__wedding.scroll.lenis.scrollTo(max * progress, { immediate: true, force: true });
  }, position);
  await page.waitForTimeout(1000);
  const name = `scripts/renders/${tag}-${width}-${Math.round(position * 100)}.png`;
  await page.screenshot({ path: name, scale: 'css', type: 'png' });
  console.log('saved', name);
}

console.log('errors:', JSON.stringify(errors));
await browser.close();
