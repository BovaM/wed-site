import * as THREE from 'three';
import { ENGRAVING_POINTS } from '../text/engraving-points.js';

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(edge0, edge1, value) {
  const x = clamp01((value - edge0) / (edge1 - edge0));
  return x * x * (3 - 2 * x);
}

/**
 * Точки, лежащие прямо на гравировке.
 *
 * Сначала они проявляют буквы, затем мягко разрастаются в силуэт.
 * Цвет — лавандовый из палитры, без жёлтого.
 */
export function createEngravingDots() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(ENGRAVING_POINTS, 3),
  );

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color('#8b7fa6') },
      uOpacity: { value: 0 },
      uSize: { value: 2.2 },
      uPixelRatio: { value: 1 },
    },
    vertexShader: /* glsl */ `
      uniform float uSize;
      uniform float uPixelRatio;

      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = uSize * uPixelRatio;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;

      void main() {
        vec2 uv = gl_PointCoord - vec2(0.5);
        float distanceToCenter = length(uv);
        float core = smoothstep(0.5, 0.12, distanceToCenter);
        float halo = smoothstep(0.5, 0.0, distanceToCenter) * 0.32;
        float alpha = max(core, halo) * uOpacity;
        if (alpha < 0.008) discard;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
  });

  const object = new THREE.Points(geometry, material);
  object.frustumCulled = false;
  object.renderOrder = 2;

  let pixelRatio = 1;

  function setProgress(progress) {
    const p = clamp01(progress);
    const appear = smoothstep(0.54, 0.6, p);
    const fade = 1 - smoothstep(0.915, 0.975, p);
    const growth = smoothstep(0.62, 0.8, p);

    material.uniforms.uOpacity.value = appear * fade * (0.92 - growth * 0.32);
    material.uniforms.uSize.value = pixelRatio * (1.5 + growth * 2.6);
    object.visible = material.uniforms.uOpacity.value > 0.002;
  }

  function setPixelRatio(value) {
    pixelRatio = Math.min(Math.max(value, 1), 2);
    material.uniforms.uPixelRatio.value = pixelRatio;
  }

  setProgress(0);

  return {
    object,
    setProgress,
    setPixelRatio,
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
