import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export function createEnvironment(renderer, scene) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.04).texture;
  scene.environment = environment;
  scene.environmentIntensity = 0.54;

  const key = new THREE.DirectionalLight(0xfff3e4, 1.3);
  key.position.set(4.2, 2.6, -2.8);

  const rim = new THREE.DirectionalLight(0xd8e2ff, 1.05);
  rim.position.set(-4.2, 1.6, 4.2);

  const fill = new THREE.DirectionalLight(0xffffff, 0.24);
  fill.position.set(-3.4, -1.8, -2.8);

  const ambient = new THREE.HemisphereLight(0xfbf6ef, 0xb9bdc8, 0.28);

  scene.add(key, rim, fill, ambient);

  function dispose() {
    environment.dispose();
    pmrem.dispose();
    room.dispose?.();
    key.dispose();
    rim.dispose();
    fill.dispose();
    ambient.dispose();
  }

  return { key, rim, fill, ambient, dispose };
}
