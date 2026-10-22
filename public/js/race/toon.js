// Cel-shading helpers in a soft, painterly style: toon materials with a gentle
// light-to-shadow ramp and a warm rim light on edges facing away from the
// camera, plus ink outlines for instanced meshes (OutlineEffect handles the rest).
import * as THREE from 'three';

export const INK = 0x1f2633; // near-black Energy Matrix navy

// A soft ramp: a broad shadow tone, a smooth terminator and a bright lit side
const gradientMap = new THREE.DataTexture(new Uint8Array([105, 110, 125, 190, 232, 246, 252, 255]), 8, 1, THREE.RedFormat);
gradientMap.minFilter = THREE.LinearFilter;
gradientMap.magFilter = THREE.LinearFilter;
gradientMap.needsUpdate = true;

// Brighten the edges of a shape with a warm rim of its own colour
function addRimLight(shader) {
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <opaque_fragment>',
    `float rim = 1.0 - max(dot(normalize(normal), normalize(vViewPosition)), 0.0);
    outgoingLight += (diffuseColor.rgb * 0.6 + vec3(0.42, 0.38, 0.3)) * smoothstep(0.6, 1.0, rim) * 0.3;
    #include <opaque_fragment>`,
  );
}

const shared = new Map();

// A toon material. Plain colours are cached and shared; pass `map` for a unique one.
// rim: false for big flat surfaces (ground, track) that would glow at a distance.
// extend: { name, compile(shader) } adds shader code, giving a unique material
// whose program is shared with others extended the same way.
export function toon(color, { map = null, outline = true, rim = true, extend = null, ...rest } = {}) {
  const key = !map && !extend && `${color}:${outline}:${rim}:${JSON.stringify(rest)}`;
  if (key && shared.has(key)) return shared.get(key);

  const material = new THREE.MeshToonMaterial({ color, gradientMap, map, ...rest });
  if (!outline) material.userData.outlineParameters = { visible: false };
  if (rim || extend) {
    material.onBeforeCompile = (shader) => {
      extend?.compile(shader);
      if (rim) addRimLight(shader);
    };
    material.customProgramCacheKey = () => `${rim ? 'rim' : ''}:${extend?.name ?? ''}`;
  }
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
