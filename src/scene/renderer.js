import * as THREE from 'three';

export function supportsWebGL() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(
      window.WebGL2RenderingContext &&
        canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: false }),
    );
  } catch {
    return false;
  }
}

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    stencil: false,
    powerPreference: 'high-performance',
  });

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.94;
  renderer.autoClear = false;

  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const weak = coarse && (navigator.hardwareConcurrency || 8) <= 4;
  let dpr = Math.min(window.devicePixelRatio || 1, weak ? 1.5 : 2);

  const camera = new THREE.PerspectiveCamera(34, 1, 0.05, 60);
  camera.position.set(0, 0, -6);

  const state = {
    width: 1,
    height: 1,
    aspect: 1,
    dpr,
  };

  let frameAccum = 0;
  let frameCount = 0;

  function resize() {
    const parent = canvas.parentElement;
    const width = Math.max(1, parent?.clientWidth || window.innerWidth);
    const height = Math.max(1, parent?.clientHeight || window.innerHeight);
    state.width = width;
    state.height = height;
    state.aspect = width / height;
    camera.aspect = state.aspect;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(state.dpr);
    renderer.setSize(width, height, false);
  }

  function setDpr(next) {
    const clamped = Math.min(Math.max(next, 1), 2);
    if (Math.abs(clamped - state.dpr) < 0.01) return;
    state.dpr = clamped;
    resize();
  }

  /**
   * Мягкий адаптивный DPR: если первые ~2 секунды идут медленнее 47 fps,
   * снижаем плотность пикселей на 0.25, пока не достигнем 1.
   */
  function samplePerformance(dt) {
    if (dt <= 0 || dt > 0.1) return;
    frameAccum += dt;
    frameCount += 1;
    if (frameCount < 110) return;
    const average = frameAccum / frameCount;
    frameAccum = 0;
    frameCount = 0;
    if (average > 0.021 && state.dpr > 1.05) {
      setDpr(Math.max(1, state.dpr - 0.25));
    }
  }

  resize();

  return {
    renderer,
    camera,
    state,
    resize,
    setDpr,
    samplePerformance,
    get dpr() {
      return state.dpr;
    },
  };
}
