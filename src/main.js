import '@fontsource/cormorant-garamond/cyrillic-300.css';
import '@fontsource/cormorant-garamond/cyrillic-400.css';
import '@fontsource/cormorant-garamond/cyrillic-500.css';
import '@fontsource/cormorant-garamond/cyrillic-300-italic.css';
import '@fontsource/cormorant-garamond/cyrillic-400-italic.css';
import '@fontsource/cormorant-garamond/latin-300.css';
import '@fontsource/cormorant-garamond/latin-400.css';
import '@fontsource/cormorant-garamond/latin-500.css';
import '@fontsource/cormorant-garamond/latin-300-italic.css';
import '@fontsource/cormorant-garamond/latin-400-italic.css';
import '@fontsource/ibm-plex-mono/cyrillic-400.css';
import '@fontsource/ibm-plex-mono/cyrillic-500.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';

import { CONFIG } from './config.js';
import { createScroll } from './scroll/lenis.js';
import { createSceneTimeline } from './scroll/timeline.js';
import { initCountdown } from './ui/countdown.js';
import { initReveal } from './ui/reveal.js';
import { initMapModal } from './ui/map.js';
import { createWeddingScene } from './scene/scene.js';
import { supportsWebGL } from './scene/renderer.js';

const html = document.documentElement;
const stage = document.getElementById('scene-stage');
const track = document.getElementById('scene-track');
const canvas = document.getElementById('webgl');
const intro = document.getElementById('intro-copy');
const scrollCue = document.getElementById('scroll-cue');
const progressValue = document.getElementById('scene-progress');
const caption = document.getElementById('scene-caption');
const captionIndex = document.getElementById('scene-caption-index');
const captionText = document.getElementById('scene-caption-text');
const sceneEnd = document.getElementById('scene-end');
const sceneFade = document.getElementById('scene-fade');
const sceneInvite = document.getElementById('scene-invite');
const header = document.querySelector('.scene__header');

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(edge0, edge1, value) {
  const x = clamp01((value - edge0) / (edge1 - edge0));
  return x * x * (3 - 2 * x);
}

function setOpacity(element, value) {
  if (!element) return;
  element.style.opacity = value.toFixed(3);
}

function updateInterface(progress) {
  const p = clamp01(progress);

  if (intro) {
    const amount = 1 - smoothstep(0.075, 0.21, p);
    setOpacity(intro, amount);
    intro.style.transform = `translate3d(0, ${(-22 * (1 - amount)).toFixed(2)}px, 0)`;
  }

  setOpacity(scrollCue, 1 - smoothstep(0.015, 0.075, p));
  setOpacity(header, 1 - smoothstep(0.82, 0.95, p) * 0.62);
  setOpacity(sceneFade, smoothstep(0.945, 1, p));
  setOpacity(
    sceneInvite,
    smoothstep(0.74, 0.84, p) * (1 - smoothstep(0.95, 1, p)),
  );

  if (progressValue) {
    progressValue.textContent = String(Math.round(p * 100)).padStart(2, '0');
  }

  if (caption) {
    const visible = p > 0.11 && p < 0.93;
    caption.classList.toggle('is-visible', visible);
    if (p < 0.55) {
      captionIndex.textContent = '02';
      captionText.textContent = 'оборот · рельеф';
    } else if (p < 0.8) {
      captionIndex.textContent = '03';
      captionText.textContent = 'точки · гравировка';
    } else {
      captionIndex.textContent = '04';
      captionText.textContent = 'рисунок · свет';
    }
  }

  sceneEnd?.classList.toggle('is-visible', p > 0.885);
}

function mountFallback(reason) {
  console.warn('[scene] fallback:', reason);
  html.classList.add('no-webgl');
  setOpacity(intro, 1);
  if (intro) intro.style.transform = 'none';
  setOpacity(scrollCue, 1);
}

function boot() {
  initCountdown(CONFIG.eventDate);
  initReveal();

  const scroll = createScroll();
  const mapModal = initMapModal({
    onOpen: () => scroll.stop(),
    onClose: () => scroll.start(),
  });

  let scene = null;
  let timeline = null;

  function progressHandler(progress) {
    scene?.setProgress(progress);
    updateInterface(progress);
  }

  if (!supportsWebGL()) {
    mountFallback('WebGL недоступен');
  } else {
    try {
      scene = createWeddingScene(canvas);
      timeline = createSceneTimeline({ trigger: track, onUpdate: progressHandler });
      updateInterface(0);
      progressHandler(0);

      scene.ready.then(({ failed }) => {
        if (failed) {
          scene?.destroy();
          scene = null;
          timeline?.destroy();
          timeline = null;
          mountFallback('модель не загрузилась');
          return;
        }
        html.classList.add('is-ready');
        timeline?.refresh();
      });

      canvas.addEventListener(
        'webglcontextlost',
        (event) => {
          event.preventDefault();
          scene?.destroy();
          scene = null;
          timeline?.destroy();
          timeline = null;
          mountFallback('WebGL context lost');
        },
        { once: true },
      );

      const refresh = () => {
        timeline?.refresh();
        scene?.resize();
      };

      if (document.fonts?.ready) {
        document.fonts.ready.then(refresh).catch(() => {});
      }
      window.addEventListener('load', refresh, { once: true });
      window.setTimeout(refresh, 1200);
    } catch (error) {
      mountFallback(error);
    }
  }

  if (import.meta.env.DEV) {
    window.__wedding = { scene, timeline, scroll, mapModal };
  }

  if (reducedMotion) {
    html.classList.add('reduced-motion');
  }

  window.addEventListener(
    'pagehide',
    () => {
      scene?.destroy();
      timeline?.destroy();
      mapModal.destroy();
      scroll.destroy();
    },
    { once: true },
  );
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
