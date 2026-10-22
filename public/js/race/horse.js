// A racehorse and jockey in a soft, painterly cel-shaded style.
//
// Each is one seamless sculpted mesh (see anatomy.js and sculpt.js) on a
// skeleton, so muscles and joints bend smoothly as it gallops. The mesh is
// shared by every horse; what makes each one different is paint: coat colour,
// pinto patches, socks and a face marking, the jockey's racing silks and skin
// tone, and the number on the saddle cloth.
//
// The gallop (gait.js) is driven by distance travelled, so it slows down in
// slow motion. The jockey's feet stay in the irons and hands on the reins,
// worked out each frame, and they push hands-and-heels in the finish.
//
// The horse faces +x with its origin on the ground under the middle of its body.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { BIT, BONES, EAR, EYE, IRON, PAINTS, RIDER } from './anatomy.js';
import { STRIDE, gallopPose } from './gait.js';
import { buildModel } from './model.js';
import { lookFor, markAttributes, markingsMaterial, paintModel } from './paint.js';
import { canvasTexture, toon } from './toon.js';

const NOSE = 1.88; // from the horse's origin to the tip of its nose, at a gallop
export const HORSE_LENGTH = 2.7;

const PAINT = Object.fromEntries(PAINTS.map((name, i) => [name, i]));
const BONE_INDEX = Object.fromEntries(BONES.map((b, i) => [b.name, i]));

// Small parts that are better made directly than sculpted: eyes, ears, bit,
// stirrups and leathers, reins and whip. Each is fixed to one bone.
function details() {
  const pieces = [];
  const add = (geometry, boneName, paint) => {
    geometry = geometry.index ? geometry : geometry.setIndex([...Array(geometry.attributes.position.count).keys()]);
    const count = geometry.attributes.position.count;
    const paints = typeof paint === 'function' ? paint : () => PAINT[paint];
    const paintA = new Uint8Array(count);
    const p = geometry.attributes.position;
    const n = geometry.attributes.normal;
    for (let i = 0; i < count; i++) paintA[i] = paints(p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i));
    const skinIndex = new Uint16Array(count * 4);
    const skinWeight = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      skinIndex[i * 4] = BONE_INDEX[boneName];
      skinWeight[i * 4] = 1;
    }
    pieces.push({
      positions: p.array,
      normals: n.array,
      indices: Uint32Array.from(geometry.index.array),
      ao: new Float32Array(count).fill(1),
      skinIndex,
      skinWeight,
      paintA,
      paintB: paintA,
      paintMix: new Float32Array(count),
    });
  };
  const towards = (geometry, from, to) => {
    // a geometry built along +y from the origin, stretched from `from` to `to`
    const direction = new THREE.Vector3(...to).sub(new THREE.Vector3(...from));
    const length = direction.length();
    geometry.scale(1, length, 1);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()));
    return geometry.translate(...from);
  };

  for (const side of [1, -1]) {
    const s = side > 0 ? 'R' : 'L';
    const mirror = ([x, y, z]) => [x, y, z * side];
    // Eye, with a glint and a lid around it
    const eye = mirror(EYE.center);
    add(new THREE.SphereGeometry(EYE.radius, 20, 14).scale(1.12, 0.9, 1).rotateZ(-0.35).translate(...eye), 'head', 'eye');
    add(new THREE.SphereGeometry(EYE.radius * 0.22, 8, 6).translate(eye[0] + 0.012, eye[1] + 0.011, eye[2] + EYE.radius * 0.82 * side), 'head', 'glint');
    add(new THREE.TorusGeometry(EYE.radius * 1.04, 0.008, 6, 20).scale(1.12, 0.9, 1).rotateZ(-0.35).rotateY(side > 0 ? 0.25 : -0.25).translate(eye[0], eye[1], eye[2] + 0.004 * side), 'head', 'inner');
    // Ear: a tapering leaf, darker inside
    const ear = new THREE.SphereGeometry(1, 14, 10).translate(0, 1, 0).scale(0.04, 0.5, 0.022);
    ear.attributes.position.array.forEach((value, i, array) => {
      if (i % 3 !== 0) return;
      const t = array[i + 1]; // 0..1 up the ear
      const taper = Math.sin(Math.PI * Math.min(1, t * 0.95 + 0.05)) ** 0.7 * (1.15 - t * 0.5);
      array[i] *= taper;
      array[i + 2] *= taper;
    });
    ear.scale(1, 0.17, 1).rotateZ(-0.12).rotateX(0.3 * side).translate(...mirror(EAR.base));
    ear.computeVertexNormals();
    add(ear, 'head', (x, y, z, nx) => (nx > 0.35 ? PAINT.ear : PAINT.coat));
    // Bit ring at the corner of the mouth
    add(new THREE.TorusGeometry(0.026, 0.006, 6, 16).translate(...mirror(BIT)), 'head', 'iron');
    // Stirrup leather from the saddle, and the iron under the ball of the foot
    const iron = mirror(IRON);
    add(towards(new THREE.BoxGeometry(0.03, 1, 0.008).translate(0, 0.5, 0), mirror([0.0, 1.66, 0.2]), [iron[0] - 0.01, iron[1] + 0.05, iron[2] - 0.01 * side]), 'body', 'saddle');
    add(new THREE.TorusGeometry(0.055, 0.008, 6, 18).scale(1, 0.8, 1).rotateY(Math.PI / 2).translate(...iron), 'body', 'iron');
    add(new THREE.BoxGeometry(0.07, 0.012, 0.11).translate(iron[0], iron[1] - 0.044, iron[2]), 'body', 'iron');
    // Rein: a strap that is stretched from the hand to the bit each frame
    add(new THREE.CylinderGeometry(0.009, 0.009, 1, 6, 1, true).translate(0, 0.5, 0), `rein${s}`, 'rein');
  }
  // Whip, carried in the right hand and angled back down the shoulder
  const hand = RIDER.hand;
  add(towards(new THREE.CylinderGeometry(0.006, 0.009, 1, 6).translate(0, 0.5, 0), [hand[0] + 0.02, hand[1] + 0.02, hand[2]], [0.38, 1.42, 0.3]), 'lowerArmR', 'whip');
  return pieces;
}

// Merge sculpted parts and details into one skinned geometry
function assemble({ parts, decal }) {
  const all = [...parts, ...details()];
  const total = all.reduce((sum, part) => sum + part.positions.length / 3, 0);
  const merged = {
    positions: new Float32Array(total * 3),
    normals: new Float32Array(total * 3),
    skinIndex: new Uint16Array(total * 4),
    skinWeight: new Float32Array(total * 4),
    paintA: new Uint8Array(total),
    paintB: new Uint8Array(total),
    paintMix: new Float32Array(total),
    ao: new Float32Array(total),
  };
  const indices = new Uint32Array(all.reduce((sum, part) => sum + part.indices.length, 0));
  let offset = 0;
  let at = 0;
  for (const part of all) {
    for (const key of Object.keys(merged)) merged[key].set(part[key], (offset * merged[key].length) / total);
    for (let i = 0; i < part.indices.length; i++) indices[at++] = part.indices[i] + offset;
    offset += part.positions.length / 3;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(merged.positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(merged.normals, 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(merged.skinIndex, 4));
  geometry.setAttribute('skinWeight', new THREE.BufferAttribute(merged.skinWeight, 4));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  const { marks, shade } = markAttributes(merged);
  geometry.setAttribute('marks', marks);
  geometry.setAttribute('shade', shade);

  const number = new THREE.BufferGeometry();
  number.setAttribute('position', new THREE.BufferAttribute(decal.positions, 3));
  number.setAttribute('normal', new THREE.BufferAttribute(decal.normals, 3));
  number.setAttribute('uv', new THREE.BufferAttribute(decal.uvs, 2));
  number.setIndex(new THREE.BufferAttribute(decal.indices, 1));
  return { geometry, number, paints: merged };
}

// Models are sculpted once per level of detail, in a worker if possible.
// Horses near the camera use the finest; distant ones a lighter one.
const LEVELS = ['high', 'medium', 'low'];
const NEAR = [16, 45]; // distances (at a 45 degree field of view) where detail steps down
const models = new Map();
let worker = null;
function requestModel(level) {
  if (!models.has(level)) {
    models.set(
      level,
      new Promise((resolve) => {
        const here = () => resolve(assemble(buildModel(level)));
        try {
          worker ??= new Worker(new URL('./model-worker.js', import.meta.url), { type: 'module' });
          const stop = () => {
            worker.removeEventListener('message', done);
            worker.removeEventListener('error', failed);
          };
          const done = ({ data }) => {
            if (data.level !== level) return;
            stop();
            resolve(assemble(data));
          };
          const failed = () => {
            stop();
            here(); // no workers: sculpt it on the page instead
          };
          worker.addEventListener('message', done);
          worker.addEventListener('error', failed);
          worker.postMessage(level);
        } catch {
          here();
        }
      }),
    );
  }
  return models.get(level);
}

const BONE_INVERSES = BONES.map(({ pivot }) => new THREE.Matrix4().makeTranslation(-pivot[0], -pivot[1], -pivot[2]));
const BODY_PIVOT = BONES[BONE_INDEX.body].pivot;
const shadowMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.16, depthWrite: false });
shadowMaterial.userData.outlineParameters = { visible: false };
const shadowGeometry = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2).scale(1.45, 1, 0.5);

export function createHorse(entrant, index, { detail = 'high' } = {}) {
  const look = lookFor(index);
  const { silks } = look;

  const group = new THREE.Group(); // positioned on the track
  const rig = new THREE.Group(); // the horse and rider, at this horse's size
  rig.scale.setScalar(look.size);
  group.add(rig);
  const material = markingsMaterial(look);
  const mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), material);
  mesh.castShadow = true;
  mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0.1, 1.2, 0), 2.3);
  mesh.visible = false; // until its model has been sculpted
  rig.add(mesh);

  // The skeleton, posed at the joints it was sculpted around
  const bones = BONES.map(({ name }) => Object.assign(new THREE.Bone(), { name }));
  BONES.forEach(({ parent, pivot }, i) => {
    const origin = parent < 0 ? [0, 0, 0] : BONES[parent].pivot;
    bones[i].position.set(pivot[0] - origin[0], pivot[1] - origin[1], pivot[2] - origin[2]);
    (parent < 0 ? mesh : bones[parent]).add(bones[i]);
  });
  mesh.bind(new THREE.Skeleton(bones, BONE_INVERSES), new THREE.Matrix4());
  const bone = Object.fromEntries(BONES.map(({ name }, i) => [name, bones[i]]));

  // Saddle-cloth number on both sides, carried by the body
  const cloth = canvasTexture(128, 104, (ctx, w, h) => {
    ctx.fillStyle = '#f6f4ee';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#2b3340';
    ctx.font = '800 76px Montserrat, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(silks.number), w / 2, h / 2 + 4);
  });
  cloth.anisotropy = 4;
  const clothMaterial = toon(0xffffff, { map: cloth, outline: false, rim: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const number = new THREE.Mesh(new THREE.BufferGeometry(), clothMaterial);
  number.position.set(-BODY_PIVOT[0], -BODY_PIVOT[1], -BODY_PIVOT[2]);
  bone.body.add(number);

  const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
  shadow.position.y = 0.06;
  group.add(shadow);

  // Name tag that floats above the jockey
  const tag = document.createElement('div');
  tag.className = 'horse-label';
  const badge = document.createElement('span');
  badge.className = 'horse-number';
  badge.style.background = silks.primary;
  badge.style.color = silks.ink;
  badge.textContent = silks.number;
  const name = document.createElement('span');
  name.className = 'horse-name';
  name.textContent = entrant.name;
  tag.append(badge, name);
  const label = new CSS2DObject(tag);
  label.position.set(0, 3.0, 0);
  group.add(label);

  // A geometry per level of detail: the shared shape, painted for this horse
  const levels = new Map();
  let finest = LEVELS.length - 1;
  let shown = -1;
  let disposed = false;
  const show = (level) => {
    const ready = levels.get(level);
    if (!ready || shown === level) return;
    shown = level;
    mesh.geometry = ready.geometry;
    number.geometry = ready.number;
    mesh.visible = true;
  };
  const horse = {
    id: entrant.id,
    name: entrant.name,
    ticket: entrant.ticket_number,
    number: silks.number,
    silks,
    group,
    nose: NOSE * look.size,
    mesh,
    bone,
    shadow,
    tag,
    stride: (index * 0.37) % 1, // so legs aren't all in step at the start
    effort: 0,
    push: 0,
    // The finest detail allowed (from the graphics quality); coarser levels
    // are sculpted first so horses appear quickly
    setDetail(name) {
      finest = LEVELS.indexOf(name);
      for (let level = LEVELS.length - 1; level >= finest; level--) {
        if (levels.has(level)) continue;
        levels.set(level, null);
        requestModel(LEVELS[level]).then((model) => {
          if (disposed) return;
          const geometry = new THREE.BufferGeometry();
          for (const attribute of ['position', 'normal', 'skinIndex', 'skinWeight', 'marks', 'shade']) geometry.setAttribute(attribute, model.geometry.getAttribute(attribute));
          geometry.setIndex(model.geometry.index);
          geometry.setAttribute('color', paintModel(model, look));
          levels.set(level, { geometry, number: model.number });
          if (shown < 0 || Math.abs(level - finest) < Math.abs(shown - finest)) show(level);
        });
      }
    },
    // Pick the level of detail for how big the horse is on screen
    updateDetail(camera) {
      const distance = camera.position.distanceTo(group.position) * (Math.tan((camera.fov * Math.PI) / 360) / Math.tan(Math.PI / 8));
      const slack = shown >= 0 ? 1.1 : 1; // don't flicker between levels at the boundary
      let want = distance < NEAR[0] * (shown === 0 ? slack : 1) ? 0 : distance < NEAR[1] * (shown <= 1 ? slack : 1) ? 1 : 2;
      want = Math.max(want, finest);
      // the nearest level to that which is ready
      for (const level of [want, want + 1, want - 1, want + 2, want - 2]) {
        if (level >= finest && levels.get(level)) return show(level);
      }
    },
    dispose() {
      disposed = true;
      tag.remove();
      cloth.dispose();
      clothMaterial.dispose();
      material.dispose();
      for (const ready of levels.values()) ready?.geometry.dispose();
      mesh.skeleton.dispose();
    },
  };
  horse.setDetail(detail);
  gallop(horse, 0, 0, 0);
  return horse;
}

const target = new THREE.Vector3();
const pole = new THREE.Vector3();
const root = new THREE.Vector3();
const middle = new THREE.Vector3();
const end = new THREE.Vector3();
const direction = new THREE.Vector3();
const bend = new THREE.Vector3();
const want = new THREE.Vector3();
const rest = new THREE.Vector3();
const parentRotation = new THREE.Quaternion();
const upperRotation = new THREE.Quaternion();
const scale = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

// Two-bone inverse kinematics: turn `upper` and `lower` so that the point
// `tip` (in lower's space) reaches `goal` (world), bending toward `hint`
function reach(upper, lower, tip, goal, hint) {
  upper.getWorldPosition(root);
  const size = scale.setFromMatrixScale(upper.matrixWorld).x; // the horse's size
  const first = lower.position.length() * size;
  const second = tip.length() * size;
  direction.subVectors(goal, root);
  const distance = THREE.MathUtils.clamp(direction.length(), Math.abs(first - second) + 1e-4, first + second - 1e-4);
  direction.normalize();
  bend.copy(hint).addScaledVector(direction, -hint.dot(direction)).normalize();
  const along = (first * first + distance * distance - second * second) / (2 * distance);
  middle.copy(root).addScaledVector(direction, along).addScaledVector(bend, Math.sqrt(Math.max(0, first * first - along * along)));
  end.copy(root).addScaledVector(direction, distance);

  upper.parent.getWorldQuaternion(parentRotation);
  want.subVectors(middle, root).normalize().applyQuaternion(parentRotation.clone().invert());
  upper.quaternion.setFromUnitVectors(rest.copy(lower.position).normalize(), want);
  upperRotation.multiplyQuaternions(parentRotation, upper.quaternion);
  want.subVectors(end, middle).normalize().applyQuaternion(upperRotation.invert());
  lower.quaternion.setFromUnitVectors(rest.copy(tip).normalize(), want);
}

const local = (bone, point) => new THREE.Vector3(point[0] - BONES[BONE_INDEX[bone]].pivot[0], point[1] - BONES[BONE_INDEX[bone]].pivot[1], point[2] - BONES[BONE_INDEX[bone]].pivot[2]);
const HAND_TIPS = [1, -1].map((side) => local(side > 0 ? 'lowerArmR' : 'lowerArmL', [RIDER.hand[0], RIDER.hand[1], RIDER.hand[2] * side]));
const ANKLE_TIPS = [1, -1].map((side) => local(side > 0 ? 'shinR' : 'shinL', [RIDER.ankle[0], RIDER.ankle[1], RIDER.ankle[2] * side]));
// Where the hands hold the reins on the neck: placed so they're where the
// rider was sculpted when the neck is stretched out at full gallop
const GALLOP_NECK = -0.12;
const GRIPS = [1, -1].map((side) => local('neck', [RIDER.hand[0], RIDER.hand[1], RIDER.hand[2] * side]).applyAxisAngle(new THREE.Vector3(0, 0, 1), -GALLOP_NECK));
const IRONS = [1, -1].map((side) => local('body', [RIDER.ankle[0], RIDER.ankle[1], RIDER.ankle[2] * side]));
const BITS = [1, -1].map((side) => local('head', [BIT[0], BIT[1], BIT[2] * side]));
const HAND_POINTS = [1, -1].map((side) => local(side > 0 ? 'lowerArmR' : 'lowerArmL', [RIDER.hand[0] + 0.02, RIDER.hand[1], RIDER.hand[2] * side * 0.6]));
const PELVIS_REST = local('body', BONES[BONE_INDEX.pelvis].pivot);
const BODY_REST_Y = BODY_PIVOT[1];
const hand = new THREE.Vector3();
const bit = new THREE.Vector3();

// Advance the gallop by `distance` metres. effort 0..1 scales the motion (0 =
// standing still, 1 = flat out); push 0..1 is how hard the jockey is riding.
// time (seconds) lets a standing horse fidget: breathing, nodding, swishing its tail.
export function gallop(horse, distance, effort, push = 0, time = null) {
  horse.stride = (horse.stride + distance / STRIDE) % 1;
  const { bone, mesh } = horse;
  const pose = gallopPose(horse.stride, effort);
  bone.body.position.y = BODY_REST_Y + pose.bob;
  for (const [name, angle] of Object.entries(pose.rotation)) bone[name].rotation.z = angle;
  bone.neck.rotation.y = 0;
  if (time !== null) {
    const calm = 1 - effort;
    const t = time + horse.stride * 10; // each horse on its own rhythm
    bone.body.position.y += Math.sin(t * 1.6) * 0.006 * calm;
    bone.neck.rotation.z += (Math.sin(t * 0.7) * 0.06 + Math.sin(t * 2.3) * 0.015) * calm;
    bone.head.rotation.z += Math.sin(t * 0.9 + 1) * 0.05 * calm;
    bone.neck.rotation.y = Math.sin(t * 0.45) * 0.1 * calm;
  }

  // Tail: lifts and streams out behind, rippling with the stride
  const cycle = horse.stride * Math.PI * 2;
  ['tail0', 'tail1', 'tail2', 'tail3'].forEach((name, i) => {
    bone[name].rotation.z = [-0.6, -0.22, -0.1, -0.04][i] * effort + Math.sin(cycle * 2 - i * 0.9) * 0.08 * effort;
    bone[name].rotation.x = Math.sin(cycle - i * 0.7) * 0.06 * effort;
    if (time !== null) bone[name].rotation.x += Math.sin(time * 1.3 + horse.stride * 10 - i * 0.6) * (0.05 + i * 0.03) * (1 - effort);
  });

  // The jockey floats over the gallop, crouched, rocking when riding hard
  const rock = Math.sin(cycle + 2.2) * push;
  bone.pelvis.position.copy(PELVIS_REST).add({ x: 0.03 * rock, y: -pose.bob * 0.8, z: 0 });
  bone.pelvis.rotation.z = -pose.pitch * 0.9;
  bone.torso.rotation.z = 0.06 * rock - 0.02 * push;
  bone.riderHead.rotation.z = -0.06 * rock + 0.04 * push;

  // Hands follow the horse's head on the reins (pushing harder in the finish);
  // feet stay in the irons
  mesh.updateMatrixWorld(true);
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? 'R' : 'L';
    target.copy(GRIPS[i]).add({ x: 0.05 * Math.sin(cycle + 0.4) * push, y: 0, z: 0 });
    bone.neck.localToWorld(target);
    pole.set(-0.3, -1, 0.9 * (i === 0 ? 1 : -1)).transformDirection(mesh.matrixWorld);
    reach(bone[`upperArm${s}`], bone[`lowerArm${s}`], HAND_TIPS[i], target, pole);
    target.copy(IRONS[i]);
    bone.body.localToWorld(target);
    pole.set(1, 0.2, 0.25 * (i === 0 ? 1 : -1)).transformDirection(mesh.matrixWorld);
    reach(bone[`thigh${s}`], bone[`shin${s}`], ANKLE_TIPS[i], target, pole);
  }

  // Reins run from the hands to the bit
  mesh.updateMatrixWorld(true);
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? 'R' : 'L';
    mesh.worldToLocal(bone[`lowerArm${s}`].localToWorld(hand.copy(HAND_POINTS[i])));
    mesh.worldToLocal(bone.head.localToWorld(bit.copy(BITS[i])));
    const rein = bone[`rein${s}`];
    rein.position.copy(hand);
    direction.subVectors(bit, hand);
    rein.scale.set(1, direction.length(), 1);
    rein.quaternion.setFromUnitVectors(UP, direction.normalize());
  }
}
