/**
 * Офлайн-запекание точек гравировки без браузера.
 *
 * 1. Blender экспортирует нецелевой GLB без Draco (scripts/export_bake_glb.py).
 * 2. Этот скрипт берёт честный скриншот гравировки в финальном ракурсе,
 *    выделяет светлые штрихи и проецирует их на поверхность маски через BVH.
 *
 * Запуск:
 *   node scripts/bake-engraving-offline.mjs
 */

import fs from 'node:fs';
import sharp from 'sharp';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  acceleratedRaycast,
  computeBoundsTree,
} from 'three-mesh-bvh';

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

const SCREENSHOT = 'scripts/renders/engraving-v3-bake.png';
const DEBUG = 'scripts/renders/engraving-v3-local-check.png';
const GLB = 'scripts/renders/mask-bake.glb';
const OUTPUT = 'src/text/engraving-points.js';

const CANVAS = { width: 1425, height: 900 };
const CAMERA = {
  fov: 34,
  position: new THREE.Vector3(0, 0.628, -2.0134164690632463),
  target: new THREE.Vector3(0, 0.608, -0.2),
};
const CROP = { left: 420, top: 290, width: 600, height: 400 };
const THRESHOLD = 210;
const MAX_POINTS = 2600;

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

const buffer = fs.readFileSync(GLB);
const arrayBuffer = buffer.buffer.slice(
  buffer.byteOffset,
  buffer.byteOffset + buffer.byteLength,
);
const gltf = await new Promise((resolve, reject) => {
  new GLTFLoader().parse(arrayBuffer, '', resolve, reject);
});

let sourceMesh = null;
gltf.scene.traverse((child) => {
  if (!sourceMesh && child.isMesh) sourceMesh = child;
});
if (!sourceMesh) throw new Error('GLB не содержит mesh');

const geometry = sourceMesh.geometry;
geometry.computeBoundingBox();
const center = new THREE.Vector3();
geometry.boundingBox.getCenter(center);
if (center.lengthSq() > 1e-8) {
  geometry.translate(-center.x, -center.y, -center.z);
  geometry.computeBoundingBox();
}
geometry.computeBoundingSphere();
geometry.computeBoundsTree();
sourceMesh.frustumCulled = false;

const size = new THREE.Vector3();
geometry.boundingBox.getSize(size);
console.log('geometry size:', size.toArray().map((v) => v.toFixed(5)));

const scene = new THREE.Scene();
const spinGroup = new THREE.Group();
spinGroup.rotation.set(0, Math.PI, 0);
const baseGroup = new THREE.Group();
baseGroup.rotation.set(Math.PI / 2, 0, Math.PI, 'XYZ');
spinGroup.add(baseGroup);
baseGroup.add(sourceMesh);
scene.add(spinGroup);
spinGroup.updateMatrixWorld(true);
sourceMesh.updateWorldMatrix(true, false);

const camera = new THREE.PerspectiveCamera(
  CAMERA.fov,
  CANVAS.width / CANVAS.height,
  0.1,
  100,
);
camera.position.copy(CAMERA.position);
camera.lookAt(CAMERA.target);
camera.updateMatrixWorld();

const raycaster = new THREE.Raycaster();
raycaster.firstHitOnly = true;
const ndc = new THREE.Vector2();

const { data, info } = await sharp(SCREENSHOT)
  .extract(CROP)
  .greyscale()
  .raw()
  .toBuffer({ resolveWithObject: true });

const candidates = [];
for (let y = 1; y < info.height - 1; y += 1) {
  for (let x = 1; x < info.width - 1; x += 1) {
    if (data[y * info.width + x] < THRESHOLD) continue;
    if (CROP.top + y > 700) continue;
    const sx = CROP.left + x;
    if (sx >= CANVAS.width) continue;
    candidates.push(sx, CROP.top + y);
  }
}
console.log('bright candidates:', candidates.length / 2);

const random = mulberry32(20261101);
const total = candidates.length / 2;
const take = Math.min(MAX_POINTS, total);
const order = new Uint32Array(total);
for (let i = 0; i < total; i += 1) order[i] = i;
for (let i = 0; i < take; i += 1) {
  const j = i + Math.floor(random() * (total - i));
  const temp = order[i];
  order[i] = order[j];
  order[j] = temp;
}

const localPoints = [];
const projectedScreens = [];
const debugDots = [];
let misses = 0;

for (let i = 0; i < take; i += 1) {
  const source = order[i] * 2;
  const x = candidates[source];
  const y = candidates[source + 1];

  ndc.set((x / CANVAS.width) * 2 - 1, -(y / CANVAS.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObject(sourceMesh, false)[0];
  if (!hit) {
    misses += 1;
    continue;
  }

  const world = hit.point.clone();
  // Чуть сдвигаем к камере, чтобы точки не тонули в поверхности.
  world.addScaledVector(raycaster.ray.direction, -0.004);
  const local = baseGroup.worldToLocal(world.clone());
  localPoints.push([local.x, local.y, local.z]);

  const back = local.clone();
  baseGroup.localToWorld(back);
  const screen = back.clone().project(camera);
  projectedScreens.push([
    (screen.x * 0.5 + 0.5) * CANVAS.width,
    (0.5 - screen.y * 0.5) * CANVAS.height,
  ]);
  debugDots.push(
    `<circle cx="${(screen.x * 0.5 + 0.5) * CANVAS.width}" cy="${(0.5 - screen.y * 0.5) * CANVAS.height}" r="2" fill="#6f5e8d" fill-opacity="0.8"/>`,
  );
}

console.log('local points:', localPoints.length, 'misses:', misses);
if (!localPoints.length) throw new Error('Точки не спроецировались');

const numbers = localPoints
  .map(([x, y, z]) => [x.toFixed(5), y.toFixed(5), z.toFixed(5)].join(', '))
  .join(',\n  ');

const content = `// Autogenerated by scripts/bake-engraving-offline.mjs.\n// Local-space points sampled from the actual engraved relief of the mask.\nexport const ENGRAVING_POINTS = new Float32Array([\n  ${numbers},\n]);\n`;
fs.writeFileSync(OUTPUT, content, 'utf8');
console.log(`written ${OUTPUT}: ${localPoints.length} points`);

const metadata = await sharp(SCREENSHOT).metadata();
await sharp(SCREENSHOT)
  .composite([
    {
      input: Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${metadata.width}" height="${metadata.height}">${debugDots.join('')}</svg>`,
      ),
      top: 0,
      left: 0,
    },
  ])
  .png()
  .toFile(DEBUG);
console.log(`written ${DEBUG}`);
