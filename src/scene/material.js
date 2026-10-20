import * as THREE from 'three';

export function createPorcelainMaterial() {
  const material = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#e3ddd4'),
    roughness: 0.42,
    metalness: 0,
    clearcoat: 0.5,
    clearcoatRoughness: 0.24,
    sheen: 0.2,
    sheenColor: new THREE.Color('#ded7ea'),
    sheenRoughness: 0.66,
    envMapIntensity: 0.64,
    emissive: new THREE.Color('#f6f4f1'),
    emissiveIntensity: 0.008,
    transparent: true,
    opacity: 0,
  });

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uRimColor = { value: new THREE.Color('#beb6ca') };
    shader.uniforms.uRimPower = { value: 2.6 };
    shader.uniforms.uRimStrength = { value: 0.55 };

    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        /* glsl */ `
          uniform vec3 uRimColor;
          uniform float uRimPower;
          uniform float uRimStrength;
          void main() {
        `,
      )
      .replace(
        '#include <opaque_fragment>',
        /* glsl */ `
          float porcelainRim = 1.0 - saturate(dot(normalize(normal), normalize(vViewPosition)));
          outgoingLight += uRimColor * pow(porcelainRim, uRimPower) * uRimStrength;
          #include <opaque_fragment>
        `,
      );
  };

  material.customProgramCacheKey = () => 'porcelain-rim-v1';
  return material;
}
