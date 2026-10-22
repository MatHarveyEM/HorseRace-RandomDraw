import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BONES, FRONT, HIND, PAINTS } from '../public/js/race/anatomy.js';
import { FOOTFALLS, STRIDE, gallopPose } from '../public/js/race/gait.js';
import { buildModel } from '../public/js/race/model.js';
import { ellipsoid, sculpt, tube } from '../public/js/race/sculpt.js';

// Fraction of triangles that face the same way as the surface normals
function outwardFacing({ positions: p, normals: n, indices }) {
  let outward = 0;
  for (let t = 0; t < indices.length; t += 3) {
    const [a, b, c] = [indices[t] * 3, indices[t + 1] * 3, indices[t + 2] * 3];
    const u = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]];
    const v = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]];
    const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const normal = [0, 1, 2].map((k) => n[a + k] + n[b + k] + n[c + k]);
    if (cross[0] * normal[0] + cross[1] * normal[1] + cross[2] * normal[2] >= 0) outward++;
  }
  return outward / (indices.length / 3);
}

test('sculpting makes a smooth closed surface lying on the shapes', () => {
  const shapes = [ellipsoid([0, 0, 0], [0.5, 0.3, 0.4], { rotate: [0.3, 0.2, 0.1] }), tube([[0.3, 0, 0, 0.1, 0.1], [0.9, 0.3, 0, 0.05, 0.08]], { bone: 1, blend: 0.1 })];
  const model = sculpt(shapes, { bounds: [[-1, -1, -1], [1.2, 1, 1]], step: 0.04, parents: [-1, 0] });
  for (let v = 0; v < model.positions.length; v += 3) {
    assert.ok(Math.abs(model.field(model.positions[v], model.positions[v + 1], model.positions[v + 2])) < 1e-3, 'vertex off the surface');
    assert.ok(Math.abs(Math.hypot(model.normals[v], model.normals[v + 1], model.normals[v + 2]) - 1) < 1e-4, 'normal not unit length');
  }
  assert.ok(outwardFacing(model) > 0.995);
  // Every edge is shared by two triangles (no holes)
  const edges = new Map();
  for (let t = 0; t < model.indices.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const [a, b] = [model.indices[t + e], model.indices[t + ((e + 1) % 3)]];
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  const open = [...edges.values()].filter((count) => count % 2).length;
  assert.equal(open, 0);
});

test('the horse and rider model is skinned and painted throughout', () => {
  const { parts, decal } = buildModel('low');
  for (const part of parts) {
    const count = part.positions.length / 3;
    assert.ok(count > 500);
    assert.ok(outwardFacing(part) > 0.98);
    for (let v = 0; v < count; v++) {
      const weights = part.skinWeight.subarray(v * 4, v * 4 + 4);
      assert.ok(Math.abs(weights.reduce((sum, w) => sum + w, 0) - 1) < 1e-4, 'skin weights should add up to 1');
      for (const bone of part.skinIndex.subarray(v * 4, v * 4 + 4)) assert.ok(bone < BONES.length);
      assert.ok(part.paintA[v] < PAINTS.length && part.paintB[v] < PAINTS.length);
    }
  }
  assert.equal(decal.positions.length / 3, 2 * 9 * 7); // the saddle-cloth number on both sides
});

// Where a hoof's toe is, following the skeleton from the body down
function toe(pose, hoof, point) {
  const chain = [];
  for (let i = BONES.findIndex((b) => b.name === hoof); i >= 0; i = BONES[i].parent) chain.unshift(BONES[i]);
  let [x, y, angle, origin] = [0, 0, 0, [0, 0]];
  for (const b of chain) {
    const [dx, dy] = [b.pivot[0] - origin[0], b.pivot[1] - origin[1] + (b.name === 'body' ? pose.bob : 0)];
    [x, y] = [x + dx * Math.cos(angle) - dy * Math.sin(angle), y + dx * Math.sin(angle) + dy * Math.cos(angle)];
    angle += pose.rotation[b.name] ?? 0;
    origin = b.pivot;
  }
  const [dx, dy] = [point[0] - origin[0], point[1] - origin[1]];
  return [x + dx * Math.cos(angle) - dy * Math.sin(angle), y + dx * Math.sin(angle) + dy * Math.cos(angle)];
}

test('hooves stay planted on the ground while the body passes over them', () => {
  const legs = { frontR: ['hoofR', FRONT.toe], frontL: ['hoofL', FRONT.toe], hindR: ['hindHoofR', HIND.toe], hindL: ['hindHoofL', HIND.toe] };
  for (const [leg, [hoof, point]] of Object.entries(legs)) {
    const planted = [];
    let previous = null;
    for (let i = 0; i <= 400; i++) {
      const stride = FOOTFALLS[leg] + i / 400;
      const [x, y] = toe(gallopPose(stride % 1, 1), hoof, point);
      const ground = [x + stride * STRIDE, y]; // where it is on the ground, as the horse moves on
      if (i < 0.13 * 400) planted.push(ground);
      assert.ok(y > -0.005, `${leg} hoof goes through the ground`);
      if (previous) assert.ok(Math.hypot(ground[0] - previous[0] - STRIDE / 400, ground[1] - previous[1]) < 0.05, `${leg} jumps`);
      previous = ground;
    }
    const xs = planted.map(([x]) => x);
    assert.ok(Math.max(...xs) - Math.min(...xs) < 0.03, `${leg} hoof slides while planted`);
    assert.ok(Math.max(...planted.map(([, y]) => y)) < 0.03, `${leg} hoof lifts while planted`);
  }
});

test('a standing horse is in its sculpted pose', () => {
  const pose = gallopPose(0.3, 0);
  for (const value of [pose.bob, ...Object.values(pose.rotation)]) assert.ok(Math.abs(value) < 1e-12);
});
