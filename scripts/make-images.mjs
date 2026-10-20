import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

await mkdir('public/img', { recursive: true });

await sharp('scripts/renders/final-fallback-desktop.png')
  .resize(1440, 900, { fit: 'cover' })
  .webp({ quality: 92, effort: 6 })
  .toFile('public/img/mask-fallback.webp');

await sharp('scripts/renders/final-fallback-mobile.png')
  .resize(780, 1688, { fit: 'cover' })
  .webp({ quality: 92, effort: 6 })
  .toFile('public/img/mask-fallback-mobile.webp');

await sharp('scripts/renders/final-og.png')
  .resize(1200, 630, { fit: 'cover' })
  .png({ compressionLevel: 9, palette: false })
  .toFile('public/img/og-image.png');

console.log('images written');
