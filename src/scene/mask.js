import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { createPorcelainMaterial } from './material.js';

const MODEL_URL = `${import.meta.env.BASE_URL}models/mask-v3.glb`;
const DECODER_URL = `${import.meta.env.BASE_URL}draco/`;

export function loadMask({ onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath(DECODER_URL);
    loader.setDRACOLoader(draco);

    loader.load(
      MODEL_URL,
      (gltf) => {
        try {
          let sourceMesh = null;
          gltf.scene.traverse((child) => {
            if (!sourceMesh && child.isMesh) sourceMesh = child;
          });
          if (!sourceMesh) throw new Error('В GLB не найдена mesh-геометрия');

          const geometry = sourceMesh.geometry;
          geometry.computeBoundingBox();
          const box = geometry.boundingBox;
          const center = new THREE.Vector3();
          box.getCenter(center);
          if (center.lengthSq() > 1e-8) {
            geometry.translate(-center.x, -center.y, -center.z);
            geometry.computeBoundingBox();
          }
          geometry.computeBoundingSphere();

          const material = createPorcelainMaterial();
          sourceMesh.material?.dispose?.();
          sourceMesh.material = material;
          sourceMesh.frustumCulled = false;

          const group = new THREE.Group();
          group.add(sourceMesh);

          const size = new THREE.Vector3();
          geometry.boundingBox.getSize(size);
          const backZ = geometry.boundingBox.max.z;

          draco.dispose();

          resolve({
            group,
            mesh: sourceMesh,
            material,
            size,
            backZ,
            setOpacity(value) {
              material.opacity = THREE.MathUtils.clamp(value, 0, 1);
              material.visible = material.opacity > 0.002;
            },
            dispose() {
              geometry.dispose();
              material.dispose();
            },
          });
        } catch (error) {
          draco.dispose();
          reject(error);
        }
      },
      (event) => {
        if (onProgress && event.total) onProgress(event.loaded / event.total);
      },
      (error) => {
        draco.dispose();
        reject(error);
      },
    );
  });
}
