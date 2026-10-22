// A racehorse and jockey in a soft, painterly cel-shaded style, sculpted from
// smooth lofted shapes (see shapes.js) and painted with vertex colours: coat
// colours, pinto patches, socks, a blaze, and the jockey's racing silks.
//
// The gallop is driven by distance travelled, so it slows down in slow motion:
// legs with working knees and hocks, a nodding head, a streaming tail, and a
// jockey who absorbs the bounce and pushes hands-and-heels in the finish.
//
// The horse faces +x with its origin on the ground under the middle of its body.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { silksColourAt, silksFor } from '../silks.js';
import { combine, loft, place, solid } from './shapes.js';
import { canvasTexture, toon } from './toon.js';

export const NOSE = 1.8; // from the horse's origin to the tip of its nose
export const HORSE_LENGTH = 2.7;

const STRIDE = 7; // metres covered per gallop stride
const HOOF = 0x3b3430;
const WHITE = 0xf4f1ea;
const SKIN = 0xf1c27d;
const LEATHER = 0x3b2618;
const STRAP = 0x2a1d15;

const COATS = [
  { coat: 0x8a5230, points: 0x2b1d16, mane: 0x1f1510 }, // bay
  { coat: 0xb0602f, points: 0xa05628, mane: 0x8a4420 }, // chestnut
  { coat: 0x332a27, points: 0x221c1a, mane: 0x161210 }, // black
  { coat: 0xcfcac1, points: 0x8d877e, mane: 0xeae6de }, // grey
  { coat: 0xdcae62, points: 0xcfa258, mane: 0xf6ead0 }, // palomino
  { coat: 0xc99a5b, points: 0x2b1d16, mane: 0x1f1510 }, // buckskin
  { coat: 0x5e3b27, points: 0x2b1d16, mane: 0x1f1510 }, // brown
];

// offset = where each leg is in the stride (a four-beat gallop)
const LEGS = [
  { front: true, side: 1, offset: 0.5 },
  { front: true, side: -1, offset: 0.6 },
  { front: false, side: 1, offset: 0.0 },
  { front: false, side: -1, offset: 0.1 },
];

const NECK_PIVOT = [0.62, 1.5];
const TAIL_ROOT = [-0.98, 1.42];
const SHOULDER = [0.34, 2.17, 0.19];
const BIT = [1.72, 1.66, 0.08]; // relative to the horse, before the neck nods
const HAND = [0.38, -0.3]; // relative to the shoulder

function seeded(seed) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

const mix = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t).getHex();
const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

// Every entrant always gets the same horse: colour and markings come from their position
function markings(index) {
  const random = seeded(index * 7919 + 17);
  const coat = COATS[(index * 5 + 2) % COATS.length];
  const patches = random() < 0.25 ? Array.from({ length: 6 }, () => ({ v: random(), a: random() * Math.PI * 2, r: 0.12 + random() * 0.14 })) : [];
  return {
    ...coat,
    patches,
    blaze: random() < 0.45,
    socks: LEGS.map(() => random() < 0.3),
  };
}

// Coat colour at a point on the body: patches, plus a slightly paler belly
function coatAt(look, v, angle) {
  for (const patch of look.patches) {
    if ((v - patch.v) ** 2 * 4 + wrap(angle - patch.a) ** 2 * 0.25 < patch.r ** 2) return WHITE;
  }
  const belly = Math.max(0, -Math.cos(angle)) * 0.12;
  return mix(look.coat, 0xffffff, belly);
}

function buildBody(look) {
  // tail root ... rump ... barrel ... shoulder ... chest
  const body = loft(
    [
      [-1.02, 1.32, 0, 0.02, 0.02],
      [-0.96, 1.36, 0, 0.17, 0.15],
      [-0.85, 1.38, 0, 0.3, 0.26],
      [-0.62, 1.36, 0, 0.37, 0.31],
      [-0.35, 1.31, 0, 0.37, 0.3],
      [-0.05, 1.28, 0, 0.36, 0.3],
      [0.25, 1.3, 0, 0.37, 0.29],
      [0.5, 1.36, 0, 0.38, 0.28],
      [0.72, 1.38, 0, 0.35, 0.25],
      [0.88, 1.32, 0, 0.25, 0.19],
      [0.96, 1.28, 0, 0.12, 0.1],
      [0.99, 1.27, 0, 0.02, 0.02],
    ],
    { segments: 22, color: (v, angle) => coatAt(look, v, angle) },
  );
  // Saddle: a leather seat on the back with a girth strap round the barrel
  const saddle = loft(
    [
      [-0.3, 1.64, 0, 0.01, 0.01],
      [-0.26, 1.68, 0, 0.04, 0.17],
      [0.0, 1.69, 0, 0.035, 0.2],
      [0.2, 1.71, 0, 0.04, 0.17],
      [0.24, 1.7, 0, 0.01, 0.01],
    ],
    { segments: 12, color: () => LEATHER },
  );
  const girth = solid(place(new THREE.TorusGeometry(0.33, 0.018, 4, 24), [0.12, 1.31, 0], [0, Math.PI / 2, 0], [1, 1.1, 0.93]), STRAP);
  return combine([body, saddle, girth]);
}

// The neck and head move together, so they share a pivot at the withers
function buildNeckAndHead(look) {
  const [px, py] = NECK_PIVOT;
  const at = (x, y, z = 0) => [x - px, y - py, z];
  const neck = loft(
    [
      [...at(0.6, 1.47), 0.31, 0.22],
      [...at(0.84, 1.72), 0.25, 0.18],
      [...at(1.02, 1.92), 0.19, 0.15],
      [...at(1.15, 2.06), 0.15, 0.12],
      [...at(1.22, 2.13), 0.12, 0.1],
      [...at(1.25, 2.16), 0.02, 0.02],
    ],
    { segments: 18, color: (v, angle) => (Math.abs(wrap(angle)) < 0.35 ? look.mane : coatAt(look, v * 0.3, angle)) },
  );
  const head = loft(
    [
      [...at(1.2, 2.12), 0.02, 0.02],
      [...at(1.24, 2.13), 0.13, 0.11],
      [...at(1.36, 2.05), 0.15, 0.115],
      [...at(1.5, 1.92), 0.13, 0.1],
      [...at(1.62, 1.8), 0.11, 0.09],
      [...at(1.72, 1.7), 0.1, 0.085],
      [...at(1.78, 1.64), 0.08, 0.07],
      [...at(1.8, 1.62), 0.02, 0.02],
    ],
    {
      segments: 16,
      color: (v, angle) => {
        if (look.blaze && Math.abs(wrap(angle)) < 0.45 && v > 0.12 && v < 0.92) return WHITE;
        return v > 0.78 ? mix(look.coat, 0x1a1210, 0.35) : look.coat; // darker muzzle
      },
    },
  );
  const pieces = [neck, head];
  for (const side of [1, -1]) {
    pieces.push(solid(place(new THREE.ConeGeometry(0.045, 0.18, 6), at(1.22, 2.28, 0.06 * side), [0.1 * side, 0, -0.25]), look.coat));
    pieces.push(solid(place(new THREE.SphereGeometry(0.035, 8, 6), at(1.36, 2.07, 0.105 * side)), 0x15100d));
    pieces.push(solid(place(new THREE.SphereGeometry(0.011, 6, 4), at(1.38, 2.09, 0.135 * side)), 0xffffff));
    pieces.push(solid(place(new THREE.SphereGeometry(0.018, 6, 4), at(1.79, 1.63, 0.045 * side)), 0x1a1210));
  }
  // Mane tufts flowing back off the crest, and a forelock
  for (let k = 0; k < 9; k++) {
    const t = 0.12 + k * 0.1;
    const x = 0.62 + t * 0.6 - 0.05;
    const y = 1.55 + t * 0.6 + 0.12;
    pieces.push(solid(place(new THREE.ConeGeometry(0.045, 0.2, 5), at(x, y), [0, 0, 1.9 + k * 0.05]), look.mane));
  }
  pieces.push(solid(place(new THREE.ConeGeometry(0.04, 0.14, 5), at(1.3, 2.18), [0, 0, -2.3]), look.mane));
  // Bridle: noseband and headpiece
  pieces.push(solid(place(new THREE.TorusGeometry(0.1, 0.012, 4, 16), at(1.64, 1.76), [0, Math.PI / 2, -0.65]), STRAP));
  pieces.push(solid(place(new THREE.TorusGeometry(0.13, 0.013, 4, 16), at(1.24, 2.13), [0, Math.PI / 2, 0.45]), STRAP));
  return combine(pieces);
}

function buildTail(look) {
  return loft(
    [
      [0, 0, 0, 0.05, 0.05],
      [-0.12, -0.06, 0, 0.09, 0.07],
      [-0.28, -0.2, 0, 0.13, 0.09],
      [-0.4, -0.42, 0, 0.14, 0.08],
      [-0.46, -0.66, 0, 0.1, 0.06],
      [-0.48, -0.82, 0, 0.02, 0.02],
    ],
    { segments: 10, color: () => look.mane },
  );
}

// Upper leg hangs from the elbow (front) or stifle (hind); lower leg from the knee or hock
function buildLeg(look, { front }, sock) {
  const upper = front
    ? [[0, 0.1, 0, 0.11, 0.1], [0, -0.05, 0, 0.115, 0.1], [0.01, -0.25, 0, 0.085, 0.075], [0.01, -0.45, 0, 0.065, 0.06], [0.01, -0.5, 0, 0.07, 0.065]]
    : [[0, 0.12, 0, 0.13, 0.11], [0, -0.1, 0, 0.12, 0.1], [-0.08, -0.3, 0, 0.08, 0.07], [-0.12, -0.48, 0, 0.06, 0.055], [-0.12, -0.52, 0, 0.06, 0.055]];
  const lowerColor = (v) => (v > 0.86 ? HOOF : sock && v > 0.5 ? WHITE : look.points);
  const lower = loft(
    [
      [0, 0.02, 0, 0.065, 0.06],
      [0.01, -0.18, 0, 0.05, 0.045],
      [0.02, -0.36, 0, 0.056, 0.05],
      [0.04, -0.45, 0, 0.045, 0.04],
      [0.05, -0.5, 0, 0.055, 0.05],
      [0.055, -0.55, 0, 0.066, 0.06],
      [0.06, -0.58, 0, 0.066, 0.06],
      [0.06, -0.585, 0, 0.02, 0.02],
    ],
    { segments: 10, color: lowerColor },
  );
  return {
    upper: loft(upper, { segments: 10, color: (v) => (front && v > 0.8 ? mix(look.coat, look.points, 0.5) : look.coat) }),
    lower,
    knee: front ? [0.01, -0.5] : [-0.12, -0.5],
    hip: front ? [0.62, 1.05] : [-0.6, 1.08],
  };
}

function buildJockey(silks) {
  const shirt = (v, angle) => silksColourAt(silks, angle / (Math.PI * 2), v);
  const torso = loft(
    [
      [-0.24, 1.95, 0, 0.02, 0.02],
      [-0.2, 1.97, 0, 0.13, 0.16],
      [-0.05, 2.04, 0, 0.16, 0.19],
      [0.12, 2.11, 0, 0.17, 0.2],
      [0.28, 2.17, 0, 0.15, 0.19],
      [0.38, 2.21, 0, 0.11, 0.15],
      [0.42, 2.23, 0, 0.02, 0.02],
    ],
    { segments: 20, color: shirt },
  );
  const pieces = [
    torso,
    solid(place(new THREE.CylinderGeometry(0.05, 0.06, 0.12, 8), [0.46, 2.26, 0], [0, 0, -0.9]), SKIN),
    solid(place(new THREE.SphereGeometry(0.115, 14, 10), [0.53, 2.32, 0]), SKIN),
    // Helmet in the cap colour, with a peak and goggles
    solid(place(new THREE.SphereGeometry(0.13, 14, 8, 0, Math.PI * 2, 0, Math.PI / 1.9), [0.52, 2.34, 0]), silks.secondary),
    solid(place(new THREE.BoxGeometry(0.12, 0.02, 0.2), [0.64, 2.36, 0], [0, 0, -0.15]), silks.primary),
    solid(place(new THREE.BoxGeometry(0.04, 0.04, 0.2), [0.635, 2.31, 0]), 0x1d2126),
  ];
  for (const side of [1, -1]) {
    // Breeches from hip to knee, boots down to the stirrup
    pieces.push(
      loft(
        [
          [-0.1, 1.96, 0.17 * side, 0.085, 0.085],
          [0.05, 1.88, 0.25 * side, 0.08, 0.08],
          [0.2, 1.8, 0.3 * side, 0.07, 0.07],
          [0.21, 1.79, 0.3 * side, 0.02, 0.02],
        ],
        { segments: 10, color: () => 0xf5f5f5 },
      ),
      loft(
        [
          [0.21, 1.81, 0.3 * side, 0.02, 0.02],
          [0.2, 1.79, 0.3 * side, 0.065, 0.065],
          [0.13, 1.64, 0.32 * side, 0.055, 0.055],
          [0.08, 1.52, 0.33 * side, 0.05, 0.05],
          [0.07, 1.5, 0.33 * side, 0.02, 0.02],
        ],
        { segments: 10, color: () => 0x1d1d1d },
      ),
      solid(place(new THREE.BoxGeometry(0.16, 0.05, 0.07), [0.12, 1.49, 0.34 * side]), 0x1d1d1d),
    );
  }
  return combine(pieces);
}

// The arm from the shoulder, bent at the elbow, with a white glove
function buildArm(silks, side) {
  const sleeve = loft(
    [
      [0, 0.02, 0, 0.02, 0.02],
      [0, 0, 0, 0.062, 0.062],
      [0.06, -0.12, 0.01 * side, 0.056, 0.056],
      [0.1, -0.2, 0.02 * side, 0.05, 0.05],
      [0.25, -0.26, 0, 0.045, 0.045],
      [0.36, -0.29, -0.05 * side, 0.04, 0.04],
      [0.37, -0.295, -0.05 * side, 0.02, 0.02],
    ],
    { segments: 10, color: (v) => (v > 0.86 ? 0xffffff : silks.primary) },
  );
  const glove = solid(place(new THREE.SphereGeometry(0.045, 8, 6), [HAND[0], HAND[1], -0.06 * side]), 0xffffff);
  return combine([sleeve, glove]);
}

const shadowMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.16, depthWrite: false });
shadowMaterial.userData.outlineParameters = { visible: false };
const shadowGeometry = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2).scale(1.45, 1, 0.5);
const reinGeometry = new THREE.CylinderGeometry(0.008, 0.008, 1, 4).translate(0, 0.5, 0);
const reinMaterial = toon(STRAP, { outline: false });
const painted = toon(0xffffff, { vertexColors: true });

export function createHorse(entrant, index) {
  const silks = silksFor(index);
  const look = markings(index);
  const geometries = [];
  const mesh = (geometry, material = painted) => {
    geometries.push(geometry);
    const m = new THREE.Mesh(geometry, material);
    m.castShadow = true;
    return m;
  };

  const group = new THREE.Group(); // positioned on the track
  const rig = new THREE.Group(); // bobs and rocks with the gallop
  group.add(rig);
  rig.add(mesh(buildBody(look)));

  const neck = new THREE.Group();
  neck.position.set(NECK_PIVOT[0], NECK_PIVOT[1], 0);
  neck.add(mesh(buildNeckAndHead(look)));
  rig.add(neck);

  const tail = new THREE.Group();
  tail.position.set(TAIL_ROOT[0], TAIL_ROOT[1], 0);
  tail.add(mesh(buildTail(look)));
  rig.add(tail);

  const legs = LEGS.map((leg, i) => {
    const parts = buildLeg(look, leg, look.socks[i]);
    const hip = new THREE.Group();
    hip.position.set(parts.hip[0], parts.hip[1], (leg.front ? 0.17 : 0.18) * leg.side);
    const knee = new THREE.Group();
    knee.position.set(parts.knee[0], parts.knee[1], 0);
    knee.add(mesh(parts.lower));
    hip.add(mesh(parts.upper), knee);
    rig.add(hip);
    return { ...leg, hip, knee };
  });

  // Saddle cloth with the number, on both sides under the saddle
  const cloth = canvasTexture(128, 96, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = silks.primary;
    ctx.fillRect(0, h - 16, w, 16);
    ctx.fillStyle = '#2b3340';
    ctx.font = '800 62px Montserrat, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(silks.number), w / 2, h / 2 - 6);
  });
  const clothMaterial = toon(0xffffff, { map: cloth });
  for (const side of [1, -1]) {
    const panel = mesh(new THREE.BoxGeometry(0.6, 0.38, 0.015), clothMaterial);
    panel.position.set(-0.04, 1.44, 0.3 * side);
    panel.rotation.x = -0.12 * side;
    rig.add(panel);
  }

  const jockey = new THREE.Group();
  jockey.add(mesh(buildJockey(silks)));
  const arms = [1, -1].map((side) => {
    const arm = new THREE.Group();
    arm.position.set(SHOULDER[0], SHOULDER[1], SHOULDER[2] * side);
    arm.add(mesh(buildArm(silks, side)));
    jockey.add(arm);
    return arm;
  });
  rig.add(jockey);

  const reins = [1, -1].map(() => {
    const rein = new THREE.Mesh(reinGeometry, reinMaterial);
    rig.add(rein);
    return rein;
  });

  const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
  shadow.position.y = 0.06;
  group.add(shadow);

  // Name tag that floats above the jockey
  const tag = document.createElement('div');
  tag.className = 'horse-label';
  const number = document.createElement('span');
  number.className = 'horse-number';
  number.style.background = silks.primary;
  number.style.color = silks.ink;
  number.textContent = silks.number;
  const name = document.createElement('span');
  name.className = 'horse-name';
  name.textContent = entrant.name;
  tag.append(number, name);
  const label = new CSS2DObject(tag);
  label.position.set(0, 3.0, 0);
  group.add(label);

  const horse = {
    id: entrant.id,
    name: entrant.name,
    ticket: entrant.ticket_number,
    number: silks.number,
    silks,
    group,
    rig,
    neck,
    tail,
    legs,
    jockey,
    arms,
    reins,
    shadow,
    tag,
    phase: index, // so legs aren't all in step at the start
    dispose() {
      tag.remove();
      cloth.dispose();
      clothMaterial.dispose();
      for (const geometry of geometries) geometry.dispose();
    },
  };
  gallop(horse, 0, 0, 0);
  return horse;
}

// Rotate a point (x, y) about the origin
const turn = (x, y, angle) => [x * Math.cos(angle) - y * Math.sin(angle), x * Math.sin(angle) + y * Math.cos(angle)];
const reinFrom = new THREE.Vector3();
const reinTo = new THREE.Vector3();
const reinUp = new THREE.Vector3(0, 1, 0);

// Advance the gallop by `distance` metres. effort 0..1 scales the motion (0 =
// standing still, 1 = flat out); push 0..1 is how hard the jockey is riding.
export function gallop(horse, distance, effort, push = 0) {
  horse.phase += (distance / STRIDE) * Math.PI * 2;
  const phase = horse.phase;
  for (const leg of horse.legs) {
    const p = phase - leg.offset * Math.PI * 2;
    leg.hip.rotation.z = Math.sin(p) * 0.6 * effort;
    // Fold the lower leg as it swings forward through the air
    const fold = Math.max(0, Math.cos(p));
    leg.knee.rotation.z = (leg.front ? -1.3 : 0.9) * fold * effort;
  }
  horse.rig.position.y = Math.sin(phase + 1) * 0.08 * effort;
  horse.rig.rotation.z = Math.sin(phase + 2.5) * 0.045 * effort;
  horse.neck.rotation.z = Math.sin(phase + 0.6) * 0.08 * effort;
  horse.tail.rotation.z = -0.7 * effort + Math.sin(phase * 2) * 0.06 * effort;
  horse.tail.rotation.x = Math.sin(phase * 0.5) * 0.12 * effort;

  // The jockey stands in the irons and soaks up the bounce
  horse.jockey.position.y = -horse.rig.position.y * 0.7;
  horse.jockey.rotation.z = -horse.rig.rotation.z * 0.6;
  const armSwing = Math.sin(phase) * 0.32 * push;
  for (const arm of horse.arms) arm.rotation.z = armSwing;

  // Reins run from the jockey's hands to the bit
  const nod = horse.neck.rotation.z;
  const [bx, by] = turn(BIT[0] - NECK_PIVOT[0], BIT[1] - NECK_PIVOT[1], nod);
  const [hx, hy] = turn(HAND[0], HAND[1], armSwing);
  horse.reins.forEach((rein, i) => {
    const side = i === 0 ? 1 : -1;
    reinFrom.set(SHOULDER[0] + hx, SHOULDER[1] + hy + horse.jockey.position.y, (SHOULDER[2] - 0.06) * side);
    reinTo.set(NECK_PIVOT[0] + bx, NECK_PIVOT[1] + by, BIT[2] * side);
    rein.position.copy(reinFrom);
    reinTo.sub(reinFrom);
    rein.scale.set(1, reinTo.length(), 1);
    rein.quaternion.setFromUnitVectors(reinUp, reinTo.normalize());
  });
}
