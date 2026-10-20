import * as THREE from 'three';

const vertexShader = /* glsl */ `
  uniform float uProgress;
  uniform float uTime;
  uniform float uScale;
  uniform float uOpacity;

  attribute vec3 aStart;
  attribute vec3 aTarget;
  attribute float aSize;
  attribute float aSeed;
  attribute float aDelay;

  varying float vAlpha;

  void main() {
    float t = clamp((uProgress - aDelay * 0.36) / 0.64, 0.0, 1.0);
    t = t * t * (3.0 - 2.0 * t);

    vec3 position = mix(aStart, aTarget, t);
    float drift = 1.0 - t;
    position.x += sin(uTime * 0.65 + aSeed * 6.2831) * 0.035 * drift;
    position.y += cos(uTime * 0.52 + aSeed * 4.71) * 0.03 * drift;
    position.z += sin(uTime * 0.9 + aSeed * 3.17) * 0.02 * drift;

    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / max(0.2, -viewPosition.z);
    gl_Position = projectionMatrix * viewPosition;

    vAlpha = smoothstep(0.0, 0.14, uProgress) * uOpacity * (0.65 + 0.35 * aSeed);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;

  uniform vec3 uColor;
  varying float vAlpha;

  void main() {
    vec2 point = gl_PointCoord - vec2(0.5);
    float distanceToCenter = length(point);
    if (distanceToCenter > 0.5) discard;
    float alpha = smoothstep(0.5, 0.16, distanceToCenter);
    gl_FragColor = vec4(uColor, alpha * vAlpha);
    #include <colorspace_fragment>
  }
`;

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

function buildSegments(points, threshold = 0.032, maxNeighbors = 2) {
  const count = points.length / 3;
  const segments = [];
  const seen = new Set();
  const thresholdSq = threshold * threshold;

  for (let i = 0; i < count; i += 1) {
    const x = points[i * 3];
    const y = points[i * 3 + 1];
    const z = points[i * 3 + 2];
    let bestDistanceA = thresholdSq;
    let bestDistanceB = thresholdSq;
    let bestIndexA = -1;
    let bestIndexB = -1;

    for (let j = i + 1; j < count; j += 1) {
      const dx = x - points[j * 3];
      const dy = y - points[j * 3 + 1];
      const dz = z - points[j * 3 + 2];
      const distanceSq = dx * dx + dy * dy + dz * dz;
      if (distanceSq > bestDistanceB) continue;
      if (distanceSq < bestDistanceA) {
        bestDistanceB = bestDistanceA;
        bestIndexB = bestIndexA;
        bestDistanceA = distanceSq;
        bestIndexA = j;
      } else if (distanceSq < bestDistanceB) {
        bestDistanceB = distanceSq;
        bestIndexB = j;
      }
    }

    for (const j of [bestIndexA, bestIndexB]) {
      if (j < 0) continue;
      const key = i < j ? `${i}:${j}` : `${j}:${i}`;
      if (seen.has(key)) continue;
      seen.add(key);
      segments.push(i, j);
    }
  }

  return new Uint32Array(segments);
}

export function createConstellation(
  points,
  { renderer, color = '#4a4b51', seed = 777, threshold = 0.032 } = {},
) {
  const count = points.length / 3;
  const random = mulberry32(seed);
  const geometry = new THREE.BufferGeometry();

  const positions = new Float32Array(points);
  const starts = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const seeds = new Float32Array(count);
  const delays = new Float32Array(count);

  const bounds = {
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity,
    minZ: Infinity,
    maxZ: -Infinity,
  };
  for (let i = 0; i < count; i += 1) {
    const x = points[i * 3];
    const y = points[i * 3 + 1];
    const z = points[i * 3 + 2];
    bounds.minX = Math.min(bounds.minX, x);
    bounds.maxX = Math.max(bounds.maxX, x);
    bounds.minY = Math.min(bounds.minY, y);
    bounds.maxY = Math.max(bounds.maxY, y);
    bounds.minZ = Math.min(bounds.minZ, z);
    bounds.maxZ = Math.max(bounds.maxZ, z);
  }
  const spreadX = Math.max(0.3, (bounds.maxX - bounds.minX) * 0.55);
  const spreadY = Math.max(0.22, (bounds.maxY - bounds.minY) * 0.8);
  const spreadZ = Math.max(0.3, (bounds.maxZ - bounds.minZ) * 0.55);

  for (let i = 0; i < count; i += 1) {
    starts[i * 3] = points[i * 3] + (random() - 0.5) * spreadX;
    starts[i * 3 + 1] = points[i * 3 + 1] + (random() - 0.5) * spreadY;
    starts[i * 3 + 2] = points[i * 3 + 2] + (random() - 0.5) * spreadZ;
    sizes[i] = 0.0022 + random() * 0.0038;
    seeds[i] = random();
    delays[i] = random();
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aStart', new THREE.BufferAttribute(starts, 3));
  geometry.setAttribute('aTarget', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  geometry.setAttribute('aDelay', new THREE.BufferAttribute(delays, 1));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 3);

  const uniforms = {
    uProgress: { value: 0 },
    uTime: { value: 0 },
    uScale: { value: 1000 },
    uOpacity: { value: 0 },
    uColor: { value: new THREE.Color(color) },
  };

  const pointMaterial = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
  });

  const pointsObject = new THREE.Points(geometry, pointMaterial);
  pointsObject.frustumCulled = false;
  pointsObject.renderOrder = 4;
  pointsObject.visible = false;

  const segments = buildSegments(points, threshold);
  const lineGeometry = new THREE.BufferGeometry();
  const linePositions = new Float32Array(segments.length * 3);
  for (let i = 0; i < segments.length; i += 1) {
    const pointIndex = segments[i];
    linePositions[i * 3 + 0] = points[pointIndex * 3 + 0];
    linePositions[i * 3 + 1] = points[pointIndex * 3 + 1];
    linePositions[i * 3 + 2] = points[pointIndex * 3 + 2];
  }
  lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
  lineGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 3);

  const lineMaterial = new THREE.LineBasicMaterial({
    color: new THREE.Color(color),
    transparent: true,
    opacity: 0,
    depthWrite: false,
    toneMapped: false,
  });
  const linesObject = new THREE.LineSegments(lineGeometry, lineMaterial);
  linesObject.frustumCulled = false;
  linesObject.renderOrder = 3;
  linesObject.visible = false;

  const group = new THREE.Group();
  group.add(linesObject, pointsObject);

  function setSize(viewHeight) {
    uniforms.uScale.value = viewHeight;
  }

  function update(time) {
    uniforms.uTime.value = time;
  }

  function setReveal({ progress = 0, pointOpacity = 0, lineOpacity = 0 }) {
    uniforms.uProgress.value = THREE.MathUtils.clamp(progress, 0, 1);
    uniforms.uOpacity.value = THREE.MathUtils.clamp(pointOpacity, 0, 1);
    lineMaterial.opacity = THREE.MathUtils.clamp(lineOpacity, 0, 0.75);
    pointsObject.visible = uniforms.uOpacity.value > 0.002;
    linesObject.visible = lineMaterial.opacity > 0.002;
  }

  function dispose() {
    geometry.dispose();
    lineGeometry.dispose();
    pointMaterial.dispose();
    lineMaterial.dispose();
  }

  return {
    group,
    pointsObject,
    linesObject,
    segmentCount: segments.length / 2,
    setSize,
    setReveal,
    update,
    dispose,
  };
}
