// Sculpts the horse and rider meshes (see sculpt.js and anatomy.js) at a
// level of detail. It takes a moment, so horse.js runs it in a worker
// (model-worker.js) to keep the page responsive. No Three.js here.
import { BONES, HORSE_BOUNDS, JOCKEY_BOUNDS, NUMBER_PATCH, RIDER_HEAD_BOUNDS, horseShapes, jockeyShapes, riderHeadShapes } from './anatomy.js';
import { sculpt, surfacePoint } from './sculpt.js';
import { horseTack } from './tack.js';

// Grid spacing in metres for the horse, the (smaller, finer) rider, and the
// rider's face; and how finely the tack is divided
export const DETAIL = { high: [0.02, 0.014, 0.008, 1], medium: [0.03, 0.022, 0.014, 0.55], low: [0.045, 0.034, 0.022, 0.32] };

export function buildModel(level) {
  const [horseStep, riderStep, faceStep, tackDetail] = DETAIL[level];
  const parents = BONES.map((b) => b.parent);
  const horse = sculpt(horseShapes(), { bounds: HORSE_BOUNDS, step: horseStep, parents });
  const rider = sculpt(jockeyShapes(), { bounds: JOCKEY_BOUNDS, step: riderStep, parents });
  const face = sculpt(riderHeadShapes(), { bounds: RIDER_HEAD_BOUNDS, step: faceStep, parents, smoothing: 0.02 });
  const tack = onto(horse, horseTack(horse.field, tackDetail));
  const decal = numberPatch(horse.field);
  delete horse.field;
  delete rider.field;
  delete face.field;
  return { level, parts: [horse, tack, rider, face], decal };
}

// Give pieces laid onto a sculpted part the skin weights and shading of the
// surface underneath, so they move with it
function onto(part, { positions, normals, paints, indices }) {
  const cell = 0.05;
  const buckets = new Map();
  const key = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  const count = part.positions.length / 3;
  for (let v = 0; v < count; v++) {
    const k = key(part.positions[v * 3], part.positions[v * 3 + 1], part.positions[v * 3 + 2]);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(v);
  }
  const total = paints.length;
  const piece = {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint32Array(indices),
    ao: new Float32Array(total),
    skinIndex: new Uint16Array(total * 4),
    skinWeight: new Float32Array(total * 4),
    paintA: new Uint8Array(paints),
    paintB: new Uint8Array(paints),
    paintMix: new Float32Array(total),
  };
  for (let v = 0; v < total; v++) {
    const [x, y, z] = positions.slice(v * 3, v * 3 + 3);
    let best = -1;
    let bestDistance = Infinity;
    const [cx, cy, cz] = [x, y, z].map((value) => Math.floor(value / cell));
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          for (const u of buckets.get(`${cx + dx},${cy + dy},${cz + dz}`) ?? []) {
            const distance = (part.positions[u * 3] - x) ** 2 + (part.positions[u * 3 + 1] - y) ** 2 + (part.positions[u * 3 + 2] - z) ** 2;
            if (distance < bestDistance) [best, bestDistance] = [u, distance];
          }
        }
      }
    }
    piece.ao[v] = Math.min(1, part.ao[best] + 0.1);
    piece.skinIndex.set(part.skinIndex.subarray(best * 4, best * 4 + 4), v * 4);
    piece.skinWeight.set(part.skinWeight.subarray(best * 4, best * 4 + 4), v * 4);
  }
  return piece;
}

// Everything in a model that can be handed over from a worker without copying
export function transferables({ parts, decal }) {
  return [...parts.flatMap((part) => Object.values(part)), ...Object.values(decal)].map((array) => array.buffer);
}

// The saddle-cloth number: a grid on each side of the cloth, laid onto the
// sculpted surface so it follows the curve of the horse's side
function numberPatch(field) {
  const { center: [cx, cy], size: [width, height] } = NUMBER_PATCH;
  const [columns, rows] = [8, 6];
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  for (const side of [1, -1]) {
    const first = positions.length / 3;
    for (let r = 0; r <= rows; r++) {
      for (let c = 0; c <= columns; c++) {
        const x = cx - width / 2 + (width * c) / columns;
        const y = cy - height / 2 + (height * r) / rows;
        const { point, normal } = surfacePoint(field, [x, y, 0.6 * side], [x, y, 0]);
        positions.push(...point.map((p, i) => p + normal[i] * 0.016)); // on top of the saddle cloth
        normals.push(...normal);
        uvs.push(side > 0 ? c / columns : 1 - c / columns, r / rows);
      }
    }
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < columns; c++) {
        const a = first + r * (columns + 1) + c;
        const [b, d, e] = [a + 1, a + columns + 1, a + columns + 2];
        if (side > 0) indices.push(a, b, e, a, e, d);
        else indices.push(a, e, b, a, d, e);
      }
    }
  }
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), uvs: new Float32Array(uvs), indices: new Uint16Array(indices) };
}
