import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:5173/wed-site/?map=1';
const width = Number(process.argv[3] ?? 1440);
const height = Number(process.argv[4] ?? 900);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width, height },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await page.goto(url);
await page.waitForTimeout(8000);

await page.evaluate(() => document.querySelector('[data-place="zags"]')?.click());
await page.waitForTimeout(5000);

const info = await page.evaluate(() => {
  const attribution = document.querySelector('.leaflet-control-attribution');
  return {
    attribution: attribution?.innerHTML ?? null,
    flags: document.querySelectorAll('.leaflet-attribution-flag').length,
    modalOpen: document.getElementById('place-modal')?.classList.contains('is-open'),
  };
});

await page.screenshot({
  path: `scripts/renders/map-${width}.png`,
  scale: 'css',
  type: 'png',
  timeout: 90000,
});

console.log(JSON.stringify(info, null, 2));
console.log('errors:', JSON.stringify(errors));
await browser.close();
