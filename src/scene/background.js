import * as THREE from 'three';

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;

  varying vec2 vUv;

  uniform float uTime;
  uniform float uProgress;
  uniform float uAspect;
  uniform vec3 uBase;
  uniform vec3 uSilver;
  uniform vec3 uLavender;
  uniform vec3 uSand;
  uniform vec3 uMist;

  vec2 hash2(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return fract(sin(p) * 43758.5453123) * 2.0 - 1.0;
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(dot(hash2(i), f), dot(hash2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
      mix(dot(hash2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)), dot(hash2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    mat2 rotation = mat2(0.8, 0.6, -0.6, 0.8);
    for (int i = 0; i < 5; i++) {
      value += amplitude * noise(p);
      p = rotation * p * 2.03;
      amplitude *= 0.5;
    }
    return value;
  }

  void main() {
    vec2 uv = vUv;
    vec2 p = vec2((uv.x - 0.5) * uAspect, uv.y - 0.5) * 1.42;
    float t = uTime * 0.017;

    vec2 q = vec2(
      fbm(p + vec2(t, -t * 0.7)),
      fbm(p + vec2(5.2, 1.3) + vec2(-t * 0.5, t))
    );

    float n = fbm(p + q * 1.35 + vec2(0.0, uProgress * 0.5)) * 0.5 + 0.5;
    float n2 = fbm(p * 1.72 + vec2(-t * 0.8, t * 0.42) + 4.7) * 0.5 + 0.5;

    vec3 color = mix(uBase, uSilver, smoothstep(0.18, 0.92, n) * 0.68);
    color = mix(color, uLavender, smoothstep(0.46, 0.98, n2) * 0.42);
    color = mix(color, uSand, smoothstep(0.36, 0.92, 1.0 - n) * 0.2);
    color = mix(color, uMist, smoothstep(0.76, 1.0, n2) * 0.09);

    float halo = smoothstep(0.8, 0.02, length(p * vec2(0.9, 1.22)));
    color = mix(color, uMist, halo * 0.27);
    color = mix(color, vec3(1.0), halo * halo * 0.025);

    float shade = smoothstep(0.0, 1.0, uProgress);
    color = mix(color, uLavender, shade * 0.055);

    float vignette = smoothstep(0.18, 1.05, length(p * vec2(0.95, 1.0)));
    color *= 1.0 - vignette * 0.035;

    float grain = fract(
      sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233)) + uTime * 1.7) * 43758.5453
    );
    color += (grain - 0.5) * 0.007;

    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

export function createBackground() {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const uniforms = {
    uTime: { value: 0 },
    uProgress: { value: 0 },
    uAspect: { value: 1 },
    uBase: { value: new THREE.Color('#efeff2') },
    uSilver: { value: new THREE.Color('#dde1e8') },
    uLavender: { value: new THREE.Color('#d5cfe0') },
    uSand: { value: new THREE.Color('#e9ded6') },
    uMist: { value: new THREE.Color('#c2c6cf') },
  };

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });

  const geometry = new THREE.PlaneGeometry(2, 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  scene.add(mesh);

  function update({ time, progress, aspect }) {
    uniforms.uTime.value = time;
    uniforms.uProgress.value = progress;
    uniforms.uAspect.value = aspect;
  }

  function dispose() {
    geometry.dispose();
    material.dispose();
  }

  return { scene, camera, update, dispose };
}
