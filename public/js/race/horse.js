// A cel-shaded racehorse and jockey built from simple shapes, with a gallop
// animation driven by distance travelled (so it slows down in slow motion).
//
// The horse faces +x with its origin on the ground under the middle of its body.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { paintSilks, silksFor } from '../silks.js';
import { canvasTexture, toon } from './toon.js';

export const NOSE = 1.8; // from the horse's origin to the tip of its nose
export const HORSE_LENGTH = 2.7;

const STRIDE = 7; // metres covered per gallop stride
const HIP_HEIGHT = 1.1;

const COATS = [
  { coat: 0x7b4a2a, legs: 0x2b1d16, mane: 0x1f1510 }, // bay
  { coat: 0xa4552a, legs: 0x8e4722, mane: 0x6e3318 }, // chestnut
  { coat: 0x3a2e28, legs: 0x241c18, mane: 0x15100d }, // black
  { coat: 0xc9c3b8, legs: 0x8d877e, mane: 0x77726b }, // grey
  { coat: 0xd9aa5f, legs: 0xc99a52, mane: 0xf3e6c4 }, // palomino
  { coat: 0x5b3a26, legs: 0x2b1d16, mane: 0x1f1510 }, // brown
];

// offset = where each leg is in the stride cycle (a four-beat gallop)
const LEGS = [
  { x: 0.62, z: 0.17, offset: 0.5, front: true },
  { x: 0.62, z: -0.17, offset: 0.6, front: true },
  { x: -0.62, z: 0.17, offset: 0.0, front: false },
  { x: -0.62, z: -0.17, offset: 0.1, front: false },
];

function place(geometry, [x, y, z], rotationZ = 0, [sx, sy, sz] = [1, 1, 1]) {
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, rotationZ)),
    new THREE.Vector3(sx, sy, sz),
  );
  return geometry.applyMatrix4(matrix);
}

// Geometry is shared by every horse; only materials differ
let shapes = null;
function horseShapes() {
  if (shapes) return shapes;
  const bothSides = (make) => [make(1), make(-1)];
  shapes = {
    body: mergeGeometries([
      place(new THREE.CapsuleGeometry(0.36, 1.0, 4, 12), [0, 1.3, 0], Math.PI / 2, [1, 1, 0.82]),
      place(new THREE.CylinderGeometry(0.16, 0.28, 0.85, 10), [0.95, 1.62, 0], -0.75, [1, 1, 0.85]),
      place(new THREE.CylinderGeometry(0.1, 0.17, 0.62, 10), [1.53, 1.79, 0], -2.214, [1, 1, 0.8]),
      ...bothSides((side) => place(new THREE.ConeGeometry(0.05, 0.18, 5), [1.24, 2.08, 0.07 * side], -0.3)),
    ]),
    mane: mergeGeometries([
      place(new THREE.BoxGeometry(0.75, 0.08, 0.07), [0.84, 1.75, 0], 0.82),
      place(new THREE.ConeGeometry(0.14, 0.95, 6), [-1.29, 1.21, 0], -1.04), // tail streaming behind
    ]),
    upperLeg: new THREE.CylinderGeometry(0.1, 0.075, 0.55, 7).translate(0, -0.275, 0),
    lowerLeg: mergeGeometries([
      new THREE.CylinderGeometry(0.065, 0.055, 0.45, 6).translate(0, -0.225, 0),
      new THREE.CylinderGeometry(0.075, 0.09, 0.12, 6).translate(0, -0.5, 0),
    ]),
    saddleCloth: new THREE.BoxGeometry(0.72, 0.44, 0.66).translate(-0.1, 1.42, 0),
    silks: mergeGeometries([
      place(new THREE.CapsuleGeometry(0.19, 0.34, 3, 10), [0.12, 2.06, 0], -1.15, [1, 1, 0.9]),
      ...bothSides((side) => place(new THREE.CylinderGeometry(0.065, 0.055, 0.48, 6), [0.62, 2.01, 0.17 * side], -2.31)),
    ]),
    breeches: mergeGeometries(bothSides((side) => place(new THREE.CylinderGeometry(0.085, 0.075, 0.42, 6), [0.03, 1.82, 0.26 * side], -2.09))),
    boots: mergeGeometries(bothSides((side) => place(new THREE.CylinderGeometry(0.07, 0.06, 0.34, 6), [0.12, 1.57, 0.32 * side], -0.47))),
    face: new THREE.SphereGeometry(0.14, 12, 8).translate(0.6, 2.33, 0),
    cap: mergeGeometries([
      new THREE.SphereGeometry(0.155, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0.6, 2.36, 0),
      new THREE.BoxGeometry(0.14, 0.025, 0.2).translate(0.75, 2.37, 0),
    ]),
    shadow: new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2).scale(1.45, 1, 0.5),
  };
  return shapes;
}

// Copy of a shape with every vertex painted one colour, so the parts of a
// horse that don't move independently can be merged into a single mesh
function painted(geometry, color) {
  const { r, g, b } = new THREE.Color(color);
  const colours = new Float32Array(geometry.attributes.position.count * 3);
  for (let i = 0; i < colours.length; i += 3) colours.set([r, g, b], i);
  return geometry.clone().setAttribute('color', new THREE.BufferAttribute(colours, 3));
}

const shadowMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.16, depthWrite: false });
shadowMaterial.userData.outlineParameters = { visible: false };

export function createHorse(entrant, index) {
  const silks = silksFor(index);
  const colours = COATS[(index * 5 + 2) % COATS.length];
  const shape = horseShapes();

  const group = new THREE.Group(); // positioned on the track
  const rig = new THREE.Group(); // bobs and rocks with the gallop
  group.add(rig);

  // Horse body, mane and the jockey's breeches, boots, face and cap in one mesh
  const solid = mergeGeometries([
    painted(shape.body, colours.coat),
    painted(shape.mane, colours.mane),
    painted(shape.breeches, 0xf5f5f5),
    painted(shape.boots, 0x1d1d1d),
    painted(shape.face, 0xf1c27d),
    painted(shape.cap, silks.secondary),
  ]);
  rig.add(new THREE.Mesh(solid, toon(0xffffff, { vertexColors: true })));

  const coat = toon(colours.coat);

  const legs = LEGS.map(({ x, z, offset, front }) => {
    const hip = new THREE.Group();
    hip.position.set(x, HIP_HEIGHT, z);
    const knee = new THREE.Group();
    knee.position.y = -0.55;
    knee.add(new THREE.Mesh(shape.lowerLeg, toon(colours.legs)));
    hip.add(new THREE.Mesh(shape.upperLeg, coat), knee);
    rig.add(hip);
    return { hip, knee, offset, front };
  });

  const shirt = canvasTexture(64, 64, (ctx, w, h) => paintSilks(ctx, w, h, silks));
  const cloth = canvasTexture(128, 96, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = silks.primary;
    ctx.fillRect(0, h - 16, w, 16);
    ctx.fillStyle = '#151515';
    ctx.font = 'bold 62px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(silks.number), w / 2, h / 2 - 6);
  });
  const ownMaterials = [toon(0xffffff, { map: shirt }), toon(0xffffff, { map: cloth })];
  rig.add(new THREE.Mesh(shape.saddleCloth, ownMaterials[1]), new THREE.Mesh(shape.silks, ownMaterials[0]));

  const shadow = new THREE.Mesh(shape.shadow, shadowMaterial);
  shadow.position.y = 0.06;
  group.add(shadow);

  // Name tag that floats above the jockey
  const tag = document.createElement('div');
  tag.className = 'horse-label';
  const number = document.createElement('span');
  number.className = 'horse-number';
  number.style.background = silks.primary;
  number.textContent = silks.number;
  const name = document.createElement('span');
  name.className = 'horse-name';
  name.textContent = entrant.name;
  tag.append(number, name);
  const label = new CSS2DObject(tag);
  label.position.set(0, 3.1, 0);
  group.add(label);

  return {
    id: entrant.id,
    name: entrant.name,
    ticket: entrant.ticket_number,
    number: silks.number,
    silks,
    group,
    rig,
    legs,
    tag,
    phase: index, // so legs aren't all in step at the start
    dispose() {
      tag.remove();
      solid.dispose();
      for (const material of ownMaterials) {
        material.map.dispose();
        material.dispose();
      }
    },
  };
}

// Advance the gallop by `distance` metres. effort 0..1 scales the motion
// (0 = standing still, 1 = flat out).
export function gallop(horse, distance, effort) {
  horse.phase += (distance / STRIDE) * Math.PI * 2;
  const phase = horse.phase;
  for (const leg of horse.legs) {
    const p = phase - leg.offset * Math.PI * 2;
    leg.hip.rotation.z = Math.sin(p) * 0.62 * effort;
    // Fold the lower leg while it swings forward through the air
    const fold = Math.max(0, Math.cos(p));
    leg.knee.rotation.z = (leg.front ? -1.2 : 0.8) * fold * effort;
  }
  horse.rig.position.y = Math.sin(phase + 1) * 0.08 * effort;
  horse.rig.rotation.z = Math.sin(phase + 2.5) * 0.05 * effort;
}
