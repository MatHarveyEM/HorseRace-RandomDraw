// Smooth, organic shapes for the horses and riders.
//
// loft() sweeps an oval cross-section along a path of stations, changing size
// as it goes, like a sculptor's armature. Ends taper to a point, so shapes
// close themselves. Colours are painted per vertex by a function of where you
// are on the shape: v runs 0..1 along the path and angle goes around it
// (0 = the side facing "up" from the path), which is how coat patches, socks,
// a blaze and racing-silk patterns are drawn without textures.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const Z = new THREE.Vector3(0, 0, 1);
const X = new THREE.Vector3(1, 0, 0);

// stations: [[x, y, z, ry, rz], ...]  ry = half-thickness across the path in its
// own plane, rz = half-width sideways
export function loft(stations, { segments = 16, color = () => 0xffffff } = {}) {
  const points = stations.map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const positions = [];
  const colors = [];
  const uvs = [];
  const indices = [];
  const tangent = new THREE.Vector3();
  const side = new THREE.Vector3();
  const up = new THREE.Vector3();
  const vertex = new THREE.Vector3();
  const tint = new THREE.Color();

  stations.forEach(([, , , ry, rz], i) => {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    tangent.subVectors(next, prev).normalize();
    // Sideways is as close to +z as the path allows; "up" is square to both
    side.copy(Z).addScaledVector(tangent, -tangent.dot(Z));
    if (side.lengthSq() < 1e-6) side.copy(X).addScaledVector(tangent, -tangent.dot(X));
    side.normalize();
    up.crossVectors(side, tangent).normalize();
    const v = i / (stations.length - 1);

    for (let j = 0; j <= segments; j++) {
      const angle = (j / segments) * Math.PI * 2;
      vertex
        .copy(points[i])
        .addScaledVector(up, Math.cos(angle) * ry)
        .addScaledVector(side, Math.sin(angle) * rz);
      positions.push(vertex.x, vertex.y, vertex.z);
      tint.set(color(v, angle, vertex));
      colors.push(tint.r, tint.g, tint.b);
      uvs.push(j / segments, v);
    }
  });

  const ring = segments + 1;
  for (let i = 0; i < stations.length - 1; i++) {
    for (let j = 0; j < segments; j++) {
      const a = i * ring + j;
      const b = a + 1;
      const c = a + ring;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// A primitive painted a single colour, so it can be merged with lofts
export function solid(geometry, color) {
  const { r, g, b } = new THREE.Color(color);
  const count = geometry.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) colors.set([r, g, b], i * 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

// Merge painted pieces into one geometry (one draw call)
export function combine(pieces) {
  return mergeGeometries(pieces);
}

// Move/rotate/scale a geometry in place
export function place(geometry, [x, y, z], [rx, ry, rz] = [0, 0, 0], [sx, sy, sz] = [1, 1, 1]) {
  return geometry.applyMatrix4(
    new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
      new THREE.Vector3(sx, sy, sz),
    ),
  );
}
