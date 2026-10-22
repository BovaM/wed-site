/**
 * Пересобирает OG-картинку из живой сцены, чтобы шрифт в превью совпадал
 * со шрифтом сайта.
 *
 *   node scripts/make-og.mjs [--url=http://localhost:5173/wed-site/]
 */

import { chromium } from 'playwright';
import sharp from 'sharp';

const args = Object.fromEntries(
  process.argv.slice(2).map((item) => {
    const [key, value = 'true'] = item.replace(/^--/, '').split('=');
    return [key, value];
  }),
);

const url = args.url ?? 'http://localhost:5173/wed-site/?og=1';
const width = 1200;
const height = 630;

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width, height },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
await page.goto(url);
await page.waitForTimeout(Number(args.wait ?? 9000));

await page.addStyleTag({
  content: `
    .intro-copy {
      left: 50px;
      right: auto;
      bottom: 52px;
      align-items: flex-start;
      text-align: left;
      gap: 8px;
    }
    .intro-copy__names { font-size: 34px; letter-spacing: 0.01em; }
    .intro-copy__date { font-size: 9px; letter-spacing: 0.12em; }
    .scroll-cue { display: none !important; }
  `,
});
await page.waitForTimeout(600);

await page.screenshot({
  path: 'scripts/renders/final-og.png',
  scale: 'css',
  type: 'png',
  timeout: 90000,
});
await browser.close();

await sharp('scripts/renders/final-og.png')
  .resize(width, height, { fit: 'cover' })
  .png({ compressionLevel: 9, palette: false })
  .toFile('public/img/og-image.png');

console.log('og-image.png updated');
