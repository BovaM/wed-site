import { MASK_LINES } from '../config.js';

/**
 * Пропорции канваса подобраны под гравировку на обратной стороне маски:
 * блок шире, чем выше, с плотным межстрочным интервалом.
 */
export const TEXT_CANVAS = {
  width: 1000,
  height: 900,
  maxTextWidth: 950,
  baseFont: 80,
  lineHeight: 1.16,
  ink: '#2b2d33',
};

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

async function ensureFonts() {
  if (!document.fonts?.load) return;
  const samples = [
    'ЗАГС #1 в особняке Василия Хлудова',
    'dress code: серый, please',
    '01.11 15:00 candy bar',
  ];
  const loads = [];
  for (const sample of samples) {
    loads.push(
      document.fonts.load('500 80px "Cormorant Garamond"', sample).catch(() => []),
    );
  }
  await Promise.race([
    Promise.all(loads),
    new Promise((resolve) => window.setTimeout(resolve, 2500)),
  ]);
  await Promise.race([
    document.fonts.ready,
    new Promise((resolve) => window.setTimeout(resolve, 2500)),
  ]);
}

export async function createInvitationCanvas() {
  await ensureFonts();

  const canvas = document.createElement('canvas');
  canvas.width = TEXT_CANVAS.width;
  canvas.height = TEXT_CANVAS.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const family = '"Cormorant Garamond", "Times New Roman", serif';

  let fontPx = TEXT_CANVAS.baseFont;
  ctx.font = `500 ${fontPx}px ${family}`;

  const widest = MASK_LINES.reduce(
    (max, line) => Math.max(max, line.text ? ctx.measureText(line.text).width : 0),
    0,
  );
  if (widest > TEXT_CANVAS.maxTextWidth) {
    fontPx = Math.floor((fontPx * TEXT_CANVAS.maxTextWidth) / widest);
  }

  const lineHeightPx = Math.round(fontPx * TEXT_CANVAS.lineHeight);
  const totalHeight = lineHeightPx * MASK_LINES.length;
  const startY = (TEXT_CANVAS.height - totalHeight) / 2 + lineHeightPx / 2;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = `500 ${fontPx}px ${family}`;
  ctx.fillStyle = TEXT_CANVAS.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  MASK_LINES.forEach((line, index) => {
    if (!line.text) return;
    ctx.fillText(line.text, canvas.width / 2, startY + index * lineHeightPx);
  });

  return {
    canvas,
    fontPx,
    lineHeightPx,
    width: canvas.width,
    height: canvas.height,
    aspect: canvas.width / canvas.height,
    contentTop: startY - lineHeightPx / 2,
    contentHeight: totalHeight,
    lineCenters: MASK_LINES.map(
      (_, index) => (startY + index * lineHeightPx) / canvas.height,
    ),
  };
}

/**
 * Разреженное облако UV-точек из альфа-канала текста.
 * u/v нормированы в диапазоне 0..1 (v сверху вниз).
 */
export function sampleTextUVs(canvas, maxPoints = 2200, seed = 20261101) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const { width, height } = canvas;
  const pixels = ctx.getImageData(0, 0, width, height).data;
  const candidates = [];
  const step = 2;

  for (let y = 0; y < height; y += step) {
    const row = y * width;
    for (let x = 0; x < width; x += step) {
      const alpha = pixels[(row + x) * 4 + 3];
      if (alpha > 92) candidates.push(x, y);
    }
  }

  const total = candidates.length / 2;
  if (!total) return { uvs: new Float32Array(0), total: 0 };

  const random = mulberry32(seed);
  const count = Math.min(maxPoints, total);
  const indices = new Uint32Array(total);
  for (let i = 0; i < total; i += 1) indices[i] = i;

  // Частичное перемешивание Фишера–Йетса: нужны только первые count.
  for (let i = 0; i < count; i += 1) {
    const j = i + Math.floor(random() * (total - i));
    const tmp = indices[i];
    indices[i] = indices[j];
    indices[j] = tmp;
  }

  const uvs = new Float32Array(count * 2);
  for (let i = 0; i < count; i += 1) {
    const candidate = indices[i] * 2;
    uvs[i * 2 + 0] = candidates[candidate] / width;
    uvs[i * 2 + 1] = candidates[candidate + 1] / height;
  }

  return { uvs, total };
}
