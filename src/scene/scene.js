import * as THREE from 'three';
import { createRenderer, supportsWebGL } from './renderer.js';
import { createBackground } from './background.js';
import { createEnvironment } from './environment.js';
import { loadMask } from './mask.js';
import { createConstellation } from '../text/constellation.js';
import { ENGRAVING_POINTS } from '../text/engraving-points.js';

/**
 * После разворота модели (Z 180° + X 90°) вертикаль — это локальная Z,
 * поэтому габарит по высоте ≈ 1.844, а по ширине ≈ 1.492.
 */
const MASK_SIZE = { width: 1.4922, height: 1.8439 };
const FOV = 34;

/** Куда смотрит камера в финале: центр гравировки на обратной стороне. */
const CAMERA_TARGET = { y: 0.608, z: -0.2 };
const FRAME = { width: 0.83, height: 0.69 };

const clamp01 = (value) => Math.min(1, Math.max(0, value));

function smoothstep(edge0, edge1, value) {
  const x = clamp01((value - edge0) / (edge1 - edge0));
  return x * x * (3 - 2 * x);
}

function easeInOutCubic(value) {
  return value < 0.5
    ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function fitDistance(width, height, aspect, fill = 0.85) {
  const halfFov = THREE.MathUtils.degToRad(FOV / 2);
  const byHeight = height / (2 * Math.tan(halfFov));
  const byWidth = width / (2 * Math.tan(halfFov) * aspect);
  return Math.max(byHeight, byWidth) / fill;
}

export function createWeddingScene(canvas) {
  if (!supportsWebGL()) {
    throw new Error('WebGL недоступен');
  }

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const controls = createRenderer(canvas);
  const { renderer, camera } = controls;

  const scene = new THREE.Scene();
  const background = createBackground();
  const environment = createEnvironment(renderer, scene);

  // Маска лежит в своей исходной системе координат. Поворот-«постановка»
  // отделён от скролл-вращения, чтобы анимация всегда шла вокруг мировой вертикали.
  const spinGroup = new THREE.Group();
  const baseGroup = new THREE.Group();
  baseGroup.rotation.set(Math.PI / 2, 0, Math.PI, 'XYZ');
  spinGroup.add(baseGroup);
  scene.add(spinGroup);

  const debugRaycaster = new THREE.Raycaster();
  const debugNdc = new THREE.Vector2();

  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  const state = {
    progress: 0,
    time: 0,
    inView: true,
    visible: true,
    maskOpacity: 0,
    maskLoadedAt: 0,
    loaded: false,
    freeze: false,
    destroyed: false,
  };

  let mask = null;
  let constellation = null;
  let framing = { d0: 6, d1: 4, planeZ: CAMERA_TARGET.z };
  let reconnectFrame = 0;
  let hasFailed = false;
  let animationFrame = 0;
  let lastDrawingHeight = 0;
  let lastFrameTime = performance.now();

  function computeFraming() {
    const aspect = controls.state.aspect;
    const mobile = aspect < 0.82;
    const startFill = mobile
      ? 0.9
      : aspect > 1.85
        ? 0.86
        : aspect < 1.4
          ? 0.7
          : 0.78;
    const endFill = mobile ? 0.98 : 0.62;
    const d0 = fitDistance(MASK_SIZE.width, MASK_SIZE.height, aspect, startFill);
    const d1 = fitDistance(FRAME.width, FRAME.height, aspect, endFill);
    framing = { d0, d1, planeZ: CAMERA_TARGET.z };
  }

  function updateConstellationScale() {
    if (!constellation) return;
    const drawingHeight = renderer.domElement.height;
    const halfFov = THREE.MathUtils.degToRad(FOV / 2);
    constellation.setSize(drawingHeight / (2 * Math.tan(halfFov)));
  }

  function onResize() {
    controls.resize();
    computeFraming();
    updateConstellationScale();
  }

  computeFraming();

  const resizeObserver = new ResizeObserver(() => {
    window.cancelAnimationFrame(reconnectFrame);
    reconnectFrame = window.requestAnimationFrame(onResize);
  });
  if (canvas.parentElement) resizeObserver.observe(canvas.parentElement);
  window.addEventListener('resize', onResize, { passive: true });
  window.visualViewport?.addEventListener('resize', onResize, { passive: true });

  const intersectionObserver = new IntersectionObserver(
    ([entry]) => {
      state.inView = entry.isIntersecting;
    },
    { rootMargin: '120px 0px' },
  );
  if (canvas.parentElement) intersectionObserver.observe(canvas.parentElement);

  function onVisibilityChange() {
    state.visible = !document.hidden;
  }
  document.addEventListener('visibilitychange', onVisibilityChange);

  function onPointerMove(event) {
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (event.clientY / window.innerHeight) * 2 - 1;
  }
  function onPointerDown(event) {
    onPointerMove(event);
  }
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerdown', onPointerDown, { passive: true });

  function applyCamera(p) {
    const { d0, d1, planeZ } = framing;
    const mobile = controls.state.aspect < 0.82;
    const pullback = mobile ? d0 * 0.08 : 1.2;

    let fromX;
    let fromY;
    let fromZ;
    let lookX;
    let lookY;
    let lookZ;

    if (p <= 0.55) {
      const e = smoothstep(0.12, 0.55, p);
      fromX = 0;
      fromY = 0.05 + e * 0.3;
      fromZ = -d0 - e * pullback;
      lookX = 0;
      lookY = -0.07 * (1 - e) + e * 0.05;
      lookZ = 0;
    } else if (p <= 0.8) {
      const e = smoothstep(0.55, 0.8, p);
      fromX = 0;
      fromY = THREE.MathUtils.lerp(0.35, CAMERA_TARGET.y + 0.02, e);
      fromZ = THREE.MathUtils.lerp(-d0 - pullback, planeZ - d1, e);
      lookX = 0;
      lookY = THREE.MathUtils.lerp(0.05, CAMERA_TARGET.y, e);
      lookZ = THREE.MathUtils.lerp(0, planeZ, e);
    } else {
      const e = smoothstep(0.8, 1, p);
      fromX = 0;
      fromY = CAMERA_TARGET.y + 0.02;
      fromZ = THREE.MathUtils.lerp(planeZ - d1, planeZ - d1 * 0.965, e);
      lookX = 0;
      lookY = CAMERA_TARGET.y;
      lookZ = planeZ;
    }

    const parallax = 1 - smoothstep(0.56, 0.88, p) * 0.8;
    camera.position.set(
      fromX + pointer.sx * 0.07 * parallax,
      fromY - pointer.sy * 0.04 * parallax,
      fromZ,
    );
    camera.lookAt(lookX, lookY, lookZ);
  }

  function applyMaskTransform(p) {
    if (!mask) return;
    if (state.freeze) {
      spinGroup.rotation.set(0, Math.PI, 0);
      spinGroup.position.set(0, 0, 0);
      mask.setOpacity(1);
      return;
    }
    const rotation = easeInOutCubic(smoothstep(0.12, 0.56, p));
    const parallax = 1 - smoothstep(0.55, 0.82, p) * 0.76;
    const pointerYaw = reducedMotion ? 0 : pointer.sx * 0.055 * parallax;
    const pointerPitch = reducedMotion ? 0 : pointer.sy * 0.03 * parallax;

    spinGroup.rotation.y = Math.PI * rotation + pointerYaw;
    spinGroup.rotation.x = pointerPitch + Math.sin(rotation * Math.PI) * 0.045;
    spinGroup.rotation.z = Math.sin(rotation * Math.PI) * -0.022;
    spinGroup.position.y = reducedMotion ? 0 : Math.sin(state.time * 0.72) * 0.012;

    const now = performance.now() / 1000;
    const fade = smoothstep(0, 1, (now - state.maskLoadedAt) / 1.1);
    mask.setOpacity(fade * state.maskOpacity);
  }

  function applyText(p) {
    environment.rake.intensity = smoothstep(0.6, 0.84, p) * 1.2;
    environment.ambient.intensity = 0.28 - smoothstep(0.55, 0.85, p) * 0.08;
    renderer.toneMappingExposure = 0.94 - smoothstep(0.6, 0.85, p) * 0.05;

    const gather = smoothstep(0.55, 0.78, p);
    const stars =
      smoothstep(0.535, 0.565, p) * (1 - smoothstep(0.62, 0.68, p)) * 0.95;
    const glowPoints =
      smoothstep(0.6, 0.67, p) * (1 - smoothstep(0.9, 0.97, p)) * 0.55;
    const glowLines =
      smoothstep(0.65, 0.74, p) * (1 - smoothstep(0.9, 0.97, p)) * 0.22;

    if (constellation) {
      constellation.setReveal({
        progress: gather,
        pointOpacity: 0,
        lineOpacity: 0,
        starOpacity: stars,
        glowOpacity: glowPoints,
        glowLineOpacity: glowLines,
      });
      constellation.update(reducedMotion ? 0 : state.time);
    }
  }

  function renderFrame() {
    background.update({
      time: state.time,
      progress: state.progress,
      aspect: controls.state.aspect,
    });

    renderer.clear();
    renderer.render(background.scene, background.camera);
    renderer.clearDepth();
    renderer.render(scene, camera);
  }

  function frame(now) {
    animationFrame = window.requestAnimationFrame(frame);
    const dt = Math.min(Math.max((now - lastFrameTime) / 1000, 0), 0.05);
    lastFrameTime = now;
    if (!state.inView || !state.visible || state.destroyed) return;

    state.time += dt;
    pointer.sx += (pointer.x - pointer.sx) * (1 - Math.exp(-dt * 4.5));
    pointer.sy += (pointer.y - pointer.sy) * (1 - Math.exp(-dt * 4.5));

    if (renderer.domElement.height !== lastDrawingHeight) {
      lastDrawingHeight = renderer.domElement.height;
      updateConstellationScale();
    }

    applyCamera(state.progress);
    applyMaskTransform(state.progress);
    applyText(state.progress);
    renderFrame();
    controls.samplePerformance(dt);
  }


  const ready = (async () => {
    try {
      mask = await loadMask({});
      baseGroup.add(mask.group);
      state.maskLoadedAt = performance.now() / 1000;
      state.maskOpacity = 1;
      state.loaded = true;

      try {
        constellation = createConstellation(ENGRAVING_POINTS, {
          renderer,
          color: '#68666c',
          threshold: 0.014,
        });
        baseGroup.add(constellation.group);
        updateConstellationScale();
      } catch (error) {
        console.error('[text] не удалось собрать рисунок', error);
      }

    } catch (error) {
      console.error('[mask] не удалось загрузить модель', error);
      hasFailed = true;
    }

    return { failed: hasFailed };
  })();

  function setProgress(value) {
    state.progress = clamp01(value);
  }

  function setPointer(x, y) {
    pointer.x = x;
    pointer.y = y;
  }

  function destroy() {
    state.destroyed = true;
    window.cancelAnimationFrame(animationFrame);
    window.removeEventListener('resize', onResize);
    window.visualViewport?.removeEventListener('resize', onResize);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerdown', onPointerDown);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    resizeObserver.disconnect();
    intersectionObserver.disconnect();
    mask?.dispose();
    constellation?.dispose();
    environment.dispose();
    background.dispose();
    renderer.dispose();
    renderer.forceContextLoss?.();
    scene.clear();
  }

  applyCamera(0);
  window.requestAnimationFrame(frame);

  return {
    ready,
    setProgress,
    setPointer,
    resize: onResize,
    destroy,
    get loaded() {
      return state.loaded;
    },
    get progress() {
      return state.progress;
    },
    __debug: {
      spinGroup,
      baseGroup,
      camera,
      renderer,
      environment,
      getMask: () => mask,
      getConstellation: () => constellation,
      freeze() {
        state.freeze = true;
        spinGroup.rotation.set(0, Math.PI, 0);
        spinGroup.position.set(0, 0, 0);
        spinGroup.updateMatrixWorld(true);
      },
      localPointsFromScreen(screenPoints) {
        if (!mask || !screenPoints?.length) return [];
        const canvasRect = canvas.getBoundingClientRect();
        const result = [];
        for (const [x, y] of screenPoints) {
          debugNdc.set(
            (x / canvasRect.width) * 2 - 1,
            -(y / canvasRect.height) * 2 + 1,
          );
          debugRaycaster.setFromCamera(debugNdc, camera);
          mask.mesh.updateWorldMatrix(true, false);
          const hit = debugRaycaster.intersectObject(mask.mesh, false)[0];
          if (!hit) continue;
          const point = hit.point.clone();
          point.z -= 0.003;
          baseGroup.worldToLocal(point);
          result.push([point.x, point.y, point.z]);
        }
        return result;
      },
      pick(ndcX, ndcY) {
        if (!mask) return null;
        debugNdc.set(ndcX, ndcY);
        debugRaycaster.setFromCamera(debugNdc, camera);
        mask.mesh.updateWorldMatrix(true, false);
        return debugRaycaster.intersectObject(mask.mesh, false).map((hit) => {
          const local = mask.mesh.worldToLocal(hit.point.clone());
          return {
            world: hit.point.toArray(),
            local: local.toArray(),
            distance: hit.distance,
          };
        });
      },
    },
  };
}
