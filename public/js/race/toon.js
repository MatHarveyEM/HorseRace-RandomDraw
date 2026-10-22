// Cel-shading helpers: flat toon materials with three hard light bands, plus
// ink outlines for instanced meshes (OutlineEffect handles everything else).
import * as THREE from 'three';

export const INK = 0x1b1b1b;

const gradientMap = new THREE.DataTexture(new Uint8Array([90, 170, 255]), 3, 1, THREE.RedFormat);
gradientMap.minFilter = THREE.NearestFilter;
gradientMap.magFilter = THREE.NearestFilter;
gradientMap.needsUpdate = true;

const shared = new Map();

// A toon material. Plain colours are cached and shared; pass `map` for a unique one.
export function toon(color, { map = null, outline = true, ...rest } = {}) {
  const key = !map && `${color}:${outline}:${JSON.stringify(rest)}`;
  if (key && shared.has(key)) return shared.get(key);

  const material = new THREE.MeshToonMaterial({ color, gradientMap, map, ...rest });
  if (!outline) material.userData.outlineParameters = { visible: false };
  if (key) shared.set(key, material);
  return material;
}

// OutlineEffect ignores per-instance transforms, so instanced meshes get an
// inverted hull instead: the same instances drawn back-facing, pushed out
// along their normals, in ink.
export function addInstancedOutline(mesh, thickness) {
  const material = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
  material.userData.outlineParameters = { visible: false };
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `vec3 transformed = position + normal * ${thickness.toFixed(3)};`,
    );
  };
  mesh.material.userData.outlineParameters = { visible: false };

  const hull = new THREE.InstancedMesh(mesh.geometry, material, mesh.count);
  hull.instanceMatrix = mesh.instanceMatrix;
  hull.frustumCulled = false;
  mesh.add(hull);
  return hull;
}

// A tiny canvas texture, nearest-filtered so it stays crisp and flat
export function canvasTexture(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
