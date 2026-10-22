// The racehorse and jockey, sculpted (see sculpt.js) from the masses a real
// one is built from: barrel, ribcage, hindquarters, shoulders, an arched neck
// with a crest, a head with cheeks, brow, nostrils and soft muzzle, and legs
// with forearm and gaskin muscle, knees, hocks, tendons, fetlocks and hooves.
// Tack is laid over the top afterwards (see tack.js).
//
// Also the skeleton that moves it: every shape belongs to a bone, and each
// bone pivots at its joint. Measurements are in metres, with the horse facing
// +x, standing on y = 0, centred on z = 0 (+z is its right side).
//
// No Three.js here, so it can be tested in Node.
import { ellipsoid, inflate, tube } from './sculpt.js';

// Paints: each shape is painted with one of these, and horse.js turns them into
// colours for each horse (coat colour, markings, racing silks...)
export const PAINTS = [
  'coat', 'leg', 'mane', 'hoof', 'muzzle', 'inner', 'cloth', 'clothTrim', 'saddle', 'girth', 'bridle', 'noseband',
  'eye', 'iron', 'silks', 'sleeve', 'cuff', 'collar', 'breeches', 'boot', 'bootTop', 'skin', 'cap', 'pompom',
  'peak', 'goggles', 'lens', 'glove', 'whip', 'rein', 'ear', 'glint',
];
const paint = Object.fromEntries(PAINTS.map((name, i) => [name, i]));

// Bones: [name, parent, pivot]. Legs and arms come in pairs: R (+z) and L (-z).
export const BONES = [];
const bone = {};
function addBone(name, parent, pivot) {
  bone[name] = BONES.length;
  BONES.push({ name, parent: parent === null ? -1 : bone[parent], pivot });
}

// Horse
addBone('body', null, [0, 1.3, 0]);
addBone('neck', 'body', [0.6, 1.5, 0]);
addBone('head', 'neck', [1.28, 2.06, 0]); // the poll
addBone('tail0', 'body', [-0.89, 1.54, 0]);
addBone('tail1', 'tail0', [-1.01, 1.42, 0]);
addBone('tail2', 'tail1', [-1.08, 1.16, 0]);
addBone('tail3', 'tail2', [-1.11, 0.92, 0]);
// Leg joints, side view: the shoulder blade swings from near the withers
export const FRONT = { scapula: [0.52, 1.6], shoulder: [0.86, 1.26], elbow: [0.68, 1.0], knee: [0.695, 0.56], fetlock: [0.7, 0.21], coronet: [0.745, 0.09], toe: [0.84, 0.0], z: 0.165 };
export const HIND = { hip: [-0.51, 1.3], stifle: [-0.33, 0.98], hock: [-0.61, 0.57], fetlock: [-0.595, 0.21], coronet: [-0.555, 0.09], toe: [-0.46, 0.0], z: 0.165 };
for (const [s, side] of [['R', 1], ['L', -1]]) {
  const z = FRONT.z * side;
  addBone(`scapula${s}`, 'body', [...FRONT.scapula, z]);
  addBone(`humerus${s}`, `scapula${s}`, [...FRONT.shoulder, z]);
  addBone(`forearm${s}`, `humerus${s}`, [...FRONT.elbow, z]);
  addBone(`cannon${s}`, `forearm${s}`, [...FRONT.knee, z]);
  addBone(`pastern${s}`, `cannon${s}`, [...FRONT.fetlock, z]);
  addBone(`hoof${s}`, `pastern${s}`, [...FRONT.coronet, z]);
}
for (const [s, side] of [['R', 1], ['L', -1]]) {
  const z = HIND.z * side;
  addBone(`femur${s}`, 'body', [...HIND.hip, z]);
  addBone(`gaskin${s}`, `femur${s}`, [...HIND.stifle, z]);
  addBone(`hock${s}`, `gaskin${s}`, [...HIND.hock, z]);
  addBone(`hindPastern${s}`, `hock${s}`, [...HIND.fetlock, z]);
  addBone(`hindHoof${s}`, `hindPastern${s}`, [...HIND.coronet, z]);
}

// Jockey, crouched over the withers in short stirrups
export const RIDER = {
  hip: [-0.1, 1.97, 0.1],
  knee: [0.2, 1.9, 0.25],
  ankle: [0.1, 1.53, 0.31],
  shoulder: [0.3, 2.11, 0.17],
  elbow: [0.4, 1.93, 0.24],
  hand: [0.64, 1.88, 0.085],
};
const mirrorZ = ([x, y, z], side) => [x, y, z * side];
addBone('pelvis', 'body', [-0.12, 1.98, 0]);
addBone('torso', 'pelvis', [-0.06, 2.01, 0]);
addBone('riderHead', 'torso', [0.37, 2.18, 0]);
for (const [s, side] of [['R', 1], ['L', -1]]) {
  addBone(`upperArm${s}`, 'torso', mirrorZ(RIDER.shoulder, side));
  addBone(`lowerArm${s}`, `upperArm${s}`, mirrorZ(RIDER.elbow, side));
  addBone(`thigh${s}`, 'pelvis', mirrorZ(RIDER.hip, side));
  addBone(`shin${s}`, `thigh${s}`, mirrorZ(RIDER.knee, side));
}
// Reins are stretched from the hands to the bit every frame
addBone('reinR', null, [0, 0, 0]);
addBone('reinL', null, [0, 0, 0]);
export { bone as BONE };


const sides = (build) => [1, -1].flatMap((side) => build(side, side > 0 ? 'R' : 'L'));
const options = (boneName, paintName, blend = 0.04, more = {}) => ({ bone: bone[boneName], paint: paint[paintName], blend, ...more });

// Direction helpers for the head, which slopes down toward the nose
export const POLL = [1.3, 2.05];
export const NOSE_TIP = [1.82, 1.6];
export const HEAD_ANGLE = Math.atan2(NOSE_TIP[1] - POLL[1], NOSE_TIP[0] - POLL[0]);
export const along = (t, out = 0) => {
  // a point t of the way from poll to nose, `out` toward the front of the face
  const [ux, uy] = [Math.cos(HEAD_ANGLE), Math.sin(HEAD_ANGLE)];
  return [POLL[0] + (NOSE_TIP[0] - POLL[0]) * t - uy * out, POLL[1] + (NOSE_TIP[1] - POLL[1]) * t + ux * out];
};

export function horseShapes() {
  const body = (center, radii, more) => ellipsoid(center, radii, options('body', 'coat', 0.1, more));
  const shapes = [
    // Barrel, ribcage and the deep chest behind the elbows
    body([0.05, 1.3, 0], [0.6, 0.335, 0.28]),
    body([0.42, 1.31, 0], [0.42, 0.37, 0.27], { rotate: [0, 0, -0.08], blend: 0.14 }),
    // Topline: back rising to the withers
    tube([[-0.24, 1.6, 0, 0.08, 0.13], [0.15, 1.6, 0, 0.08, 0.12], [0.45, 1.69, 0, 0.08, 0.075], [0.66, 1.66, 0, 0.1, 0.07]], options('body', 'coat', 0.14)),
    // Hindquarters: big and round from the croup down to the hamstrings
    ...sides((s) => [body([-0.53, 1.37, 0.11 * s], [0.38, 0.36, 0.19], { blend: 0.12 })]),
    // The belly tucks up toward the flank
    ellipsoid([-0.34, 0.8, 0], [0.38, 0.19, 0.45], options('body', 'coat', 0.16, { cut: true })),
    tube([[-0.2, 1.6, 0, 0.1, 0.17], [-0.53, 1.66, 0, 0.1, 0.19], [-0.83, 1.56, 0, 0.1, 0.13]], options('body', 'coat', 0.12)),
    // Chest, breast and pectorals
    body([0.78, 1.29, 0], [0.19, 0.21, 0.17], { blend: 0.12 }),
    ...sides((s) => [body([0.82, 1.13, 0.075 * s], [0.12, 0.16, 0.09], { rotate: [0, 0, -0.35], blend: 0.08 })]),
    // Shoulder blades sloping back toward the withers
    ...sides((s, n) => [ellipsoid([0.62, 1.42, 0.165 * s], [0.12, 0.31, 0.1], options(`scapula${n}`, 'coat', 0.12, { rotate: [0, 0, 0.72] }))]),

    // Neck: deep at the base, arching up to the poll, with a crest on top
    tube(
      [
        [0.56, 1.47, 0, 0.32, 0.21],
        [0.78, 1.64, 0, 0.255, 0.155],
        [0.96, 1.77, 0, 0.205, 0.125],
        [1.12, 1.89, 0, 0.165, 0.105],
        [1.24, 1.99, 0, 0.145, 0.097],
        [1.3, 2.04, 0, 0.13, 0.095],
      ],
      options('neck', 'coat', 0.1),
    ),
    tube([[0.5, 1.72, 0, 0.06, 0.1], [0.8, 1.85, 0, 0.06, 0.085], [1.05, 1.98, 0, 0.055, 0.07], [1.23, 2.1, 0, 0.05, 0.055]], options('neck', 'coat', 0.1)),

    // Head: forehead, big round cheeks, a straight face, soft muzzle and lips
    ellipsoid([...along(0.12, 0.01), 0], [0.13, 0.12, 0.112], options('head', 'coat', 0.08, { rotate: [0, 0, HEAD_ANGLE] })),
    ...sides((s) => [ellipsoid([...along(0.12, -0.075), 0.062 * s], [0.12, 0.115, 0.06], options('head', 'coat', 0.06, { rotate: [0, 0, HEAD_ANGLE + 0.5] }))]),
    tube([[...along(0.2, 0.02), 0, 0.085, 0.09], [...along(0.55, 0.0), 0, 0.075, 0.075], [...along(0.82, -0.01), 0, 0.068, 0.066]], options('head', 'coat', 0.08)),
    ...sides((s) => [tube([[...along(0.2, -0.13), 0.045 * s, 0.035, 0.035], [...along(0.65, -0.075), 0.035 * s, 0.03, 0.03]], options('head', 'coat', 0.06))]),
    ellipsoid([...along(0.88, -0.025), 0], [0.1, 0.09, 0.074], options('head', 'muzzle', 0.05, { rotate: [0, 0, HEAD_ANGLE] })),
    ellipsoid([...along(0.97, -0.035), 0], [0.055, 0.065, 0.068], options('head', 'muzzle', 0.04, { rotate: [0, 0, HEAD_ANGLE] })),
    ellipsoid([...along(0.9, -0.1), 0], [0.07, 0.035, 0.05], options('head', 'muzzle', 0.03, { rotate: [0, 0, HEAD_ANGLE] })),
    // Brow ridges, eye sockets and flared nostrils
    ...sides((s) => [
      ellipsoid([...along(0.22, 0.035), 0.09 * s], [0.055, 0.02, 0.03], options('head', 'coat', 0.035, { rotate: [0, 0, HEAD_ANGLE] })),
      ellipsoid([...along(0.24, 0.0), 0.11 * s], [0.034, 0.03, 0.026], options('head', 'inner', 0.025, { cut: true })),
      ellipsoid([...along(0.93, 0.02), 0.048 * s], [0.04, 0.02, 0.02], options('head', 'inner', 0.02, { rotate: [0, 0, HEAD_ANGLE - 0.3], cut: true })),
    ]),

    // Mane: a ridge of hair along the crest, falling in locks to the right
    tube([[0.48, 1.79, 0, 0.035, 0.045], [0.8, 1.92, 0, 0.035, 0.04], [1.05, 2.04, 0, 0.03, 0.035], [1.24, 2.16, 0, 0.025, 0.03]], options('neck', 'mane', 0.015)),
    ...Array.from({ length: 9 }, (_, k) => {
      const t = k / 8;
      const [x, y] = [0.5 + t * 0.72, 1.8 + t * 0.35];
      return tube(
        [
          [x, y, 0.01, 0.04, 0.03],
          [x - 0.05, y - 0.045, 0.06, 0.045, 0.025],
          [x - 0.09, y - 0.12 + (k % 2) * 0.02, 0.085, 0.012, 0.01],
        ],
        options('neck', 'mane', 0.02),
      );
    }),
    // Forelock
    tube([[1.27, 2.2, 0, 0.035, 0.05], [1.34, 2.15, 0, 0.03, 0.045], [1.41, 2.07, 0, 0.01, 0.02]], options('head', 'mane', 0.02)),

    // Tail: the dock, then locks of hair flowing from it, fanning out and
    // ending at different lengths
    tube([[-0.85, 1.55, 0, 0.065, 0.065], [-1.01, 1.42, 0, 0.06, 0.055]], options('tail0', 'mane', 0.04)),
    ...[
      [0, 0, 0, 1],
      [-0.025, 0.045, -0.05, 0.8],
      [0.02, -0.045, 0.03, 0.8],
      [-0.01, 0.085, 0.07, 0.55],
      [0.015, -0.085, 0.09, 0.55],
      [-0.045, 0.0, -0.08, 0.65],
    ].flatMap(([dx, dz, shorter, size]) => [
      tube([[-1.01, 1.42, dz * 0.3, 0.055 * size, 0.05 * size], [-1.06 + dx, 1.16, dz, 0.065 * size, 0.055 * size]], options('tail1', 'mane', 0.025)),
      tube([[-1.06 + dx, 1.16, dz, 0.065 * size, 0.055 * size], [-1.095 + dx * 1.5, 0.92, dz * 1.4, 0.06 * size, 0.05 * size]], options('tail2', 'mane', 0.02)),
      tube([[-1.095 + dx * 1.5, 0.92, dz * 1.4, 0.06 * size, 0.05 * size], [-1.12 + dx * 2.5, 0.6 + shorter, dz * 1.9, 0.008, 0.008]], options('tail3', 'mane', 0.015)),
    ]),

    // Legs
    ...sides((s, n) => frontLeg(s, n)),
    ...sides((s, n) => hindLeg(s, n)),
  ];

  return shapes;
}

// Points on a leg, offset from its joints: at('knee', dx, dy)
const joints = (leg, z) => (joint, dx, dy) => [leg[joint][0] + dx, leg[joint][1] + dy, z];

function frontLeg(s, n) {
  const at = joints(FRONT, FRONT.z * s);
  const leg = (name, blend = 0.04) => options(`${name}${n}`, 'leg', blend);
  return [
    // Upper arm and the triceps mass behind it, blended into the body
    tube([[...at('shoulder', 0.01, 0.01), 0.1, 0.09], [...at('elbow', 0.02, 0.03), 0.09, 0.08]], options(`humerus${n}`, 'coat', 0.1)),
    ellipsoid(at('elbow', -0.1, 0.13), [0.15, 0.14, 0.09], options(`humerus${n}`, 'coat', 0.1, { rotate: [0, 0, 0.5] })),
    // Forearm: muscular at the elbow, tapering to the knee
    tube([[...at('elbow', -0.015, 0.02), 0.115, 0.09], [...at('elbow', 0.0, -0.16), 0.09, 0.072], [...at('knee', 0, 0.04), 0.052, 0.048]], leg('forearm', 0.05)),
    ellipsoid(at('knee', 0.005, -0.005), [0.058, 0.07, 0.054], leg('forearm', 0.04)),
    // Cannon: bone in front, tendons behind; fetlock joint; sloping pastern
    tube([[...at('knee', 0.01, -0.04), 0.032, 0.035], [...at('fetlock', 0.008, 0.03), 0.034, 0.037]], leg('cannon', 0.03)),
    tube([[...at('knee', -0.03, -0.06), 0.026, 0.028], [...at('fetlock', -0.035, 0.05), 0.03, 0.03]], leg('cannon', 0.04)),
    ellipsoid(at('fetlock', -0.005, -0.005), [0.06, 0.058, 0.047], leg('cannon', 0.04)),
    tube([[...at('fetlock', 0, -0.01), 0.045, 0.042], [...at('coronet', 0, -0.005), 0.047, 0.045]], leg('pastern', 0.03)),
    // Hoof: wider at the ground, flat sole
    ellipsoid(at('coronet', 0.006, 0.0), [0.058, 0.02, 0.053], leg('pastern', 0.015)),
    tube([[...at('coronet', 0.003, 0.005), 0.054, 0.05], [...at('coronet', 0.03, -0.105), 0.075, 0.066]], options(`hoof${n}`, 'hoof', 0.012, { clip: [[0, -1, 0, -0.004], [0.766, 0.643, 0, 0.766 * (FRONT.coronet[0] + 0.098)]] })),
  ];
}

function hindLeg(s, n) {
  const z = HIND.z * s;
  const at = joints(HIND, z);
  const leg = (name, blend = 0.04) => options(`${name}${n}`, 'leg', blend);
  return [
    // Thigh and hamstring, blended into the hindquarters; the stifle at the front
    ellipsoid([...at('hip', -0.02, -0.17).slice(0, 2), z * 1.05], [0.22, 0.29, 0.14], options(`femur${n}`, 'coat', 0.12, { rotate: [0, 0, 0.45] })),
    tube([[...at('hip', -0.3, 0.02).slice(0, 2), z * 0.75, 0.14, 0.12], [...at('hip', -0.25, -0.3), 0.125, 0.1], [...at('hock', -0.035, 0.26), 0.085, 0.07]], options(`femur${n}`, 'coat', 0.1)),
    ellipsoid([...at('stifle', -0.02, 0.01).slice(0, 2), z * 1.18], [0.075, 0.08, 0.06], options(`femur${n}`, 'coat', 0.07)),
    // Gaskin (second thigh) down to the hock, with the Achilles tendon behind
    tube([[...at('stifle', -0.04, -0.01), 0.12, 0.085], [...at('hock', 0.09, 0.2), 0.095, 0.066], [...at('hock', 0.01, 0.03), 0.055, 0.048]], leg('gaskin', 0.06)),
    tube([[...at('hock', -0.005, 0.3), 0.03, 0.025], [...at('hock', -0.065, 0.04), 0.025, 0.022]], leg('gaskin', 0.05)),
    ellipsoid(at('hock', 0, -0.005), [0.065, 0.06, 0.05], leg('gaskin', 0.04)),
    ellipsoid(at('hock', -0.06, 0.035), [0.03, 0.035, 0.028], leg('gaskin', 0.03)),
    // Cannon with tendons, fetlock, pastern and hoof
    tube([[...at('hock', 0.015, -0.04), 0.033, 0.035], [...at('fetlock', 0.005, 0.03), 0.034, 0.037]], leg('hock', 0.03)),
    tube([[...at('hock', -0.025, -0.07), 0.026, 0.028], [...at('fetlock', -0.035, 0.05), 0.03, 0.03]], leg('hock', 0.04)),
    ellipsoid(at('fetlock', -0.005, -0.005), [0.058, 0.056, 0.046], leg('hock', 0.04)),
    tube([[...at('fetlock', 0, -0.01), 0.044, 0.041], [...at('coronet', 0, -0.005), 0.046, 0.044]], leg('hindPastern', 0.03)),
    ellipsoid(at('coronet', 0.006, 0.0), [0.055, 0.02, 0.05], leg('hindPastern', 0.015)),
    tube([[...at('coronet', 0.003, 0.005), 0.052, 0.048], [...at('coronet', 0.027, -0.105), 0.07, 0.062]], options(`hindHoof${n}`, 'hoof', 0.012, { clip: [[0, -1, 0, -0.004], [0.766, 0.643, 0, 0.766 * (HIND.coronet[0] + 0.09)]] })),
  ];
}

// The rider's body: hunched over the withers, elbows bent, knees up
export function jockeyShapes() {
  const shapes = [
    // Seat, lower back, chest and a rounded upper back with shoulder blades
    ellipsoid([-0.12, 1.98, 0], [0.13, 0.105, 0.145], options('pelvis', 'breeches', 0.06)),
    ellipsoid([0.0, 2.035, 0], [0.17, 0.11, 0.15], options('torso', 'silks', 0.08, { rotate: [0, 0, 0.25] })),
    ellipsoid([0.19, 2.1, 0], [0.16, 0.12, 0.165], options('torso', 'silks', 0.08, { rotate: [0, 0, 0.3] })),
    ...sides((s) => [
      ellipsoid([0.16, 2.17, 0.075 * s], [0.11, 0.05, 0.07], options('torso', 'silks', 0.06, { rotate: [0, 0, 0.3] })),
      ellipsoid([0.285, 2.115, 0.15 * s], [0.07, 0.068, 0.065], options('torso', 'silks', 0.05)),
    ]),
    // A stand-up collar for the neck to come out of
    tube([[0.3, 2.14, 0, 0.058, 0.058], [0.355, 2.172, 0, 0.056, 0.056]], options('torso', 'collar', 0.015)),
  ];
  for (const [s, side] of [['R', 1], ['L', -1]]) {
    const at = (point) => mirrorZ(point, side);
    const [shoulder, elbow, hand, hip, knee, ankle] = [RIDER.shoulder, RIDER.elbow, RIDER.hand, RIDER.hip, RIDER.knee, RIDER.ankle].map(at);
    const wrist = [hand[0] - 0.045, hand[1] + 0.005, hand[2] + 0.025 * side];
    const middle = (a, b, t) => a.map((value, i) => value + (b[i] - value) * t);
    shapes.push(
      // Arms in loose silk sleeves, white gloves gripping the reins
      tube([[...shoulder, 0.058, 0.058], [...middle(shoulder, elbow, 0.45), 0.06, 0.058], [...elbow, 0.046, 0.046]], options(`upperArm${s}`, 'sleeve', 0.04)),
      ellipsoid(elbow, [0.047, 0.047, 0.047], options(`upperArm${s}`, 'sleeve', 0.02)),
      tube([[...elbow, 0.046, 0.046], [...middle(elbow, wrist, 0.6), 0.042, 0.04], [...wrist, 0.033, 0.033]], options(`lowerArm${s}`, 'sleeve', 0.03)),
      ellipsoid(hand, [0.046, 0.04, 0.034], options(`lowerArm${s}`, 'glove', 0.02, { rotate: [0.3 * side, 0, -0.2] })),
      ellipsoid([hand[0] + 0.02, hand[1] + 0.032, hand[2] - 0.012 * side], [0.025, 0.014, 0.016], options(`lowerArm${s}`, 'glove', 0.012)),
      // Breeches, then boots with tan tops, feet in the irons
      tube([[...hip, 0.078, 0.078], [...knee, 0.058, 0.058]], options(`thigh${s}`, 'breeches', 0.06)),
      ellipsoid(knee, [0.06, 0.06, 0.058], options(`thigh${s}`, 'breeches', 0.03)),
      tube([[knee[0] - 0.015, knee[1] - 0.04, knee[2], 0.062, 0.062], [knee[0] - 0.045, knee[1] - 0.13, knee[2] + 0.015 * side, 0.058, 0.058]], options(`shin${s}`, 'bootTop', 0.012)),
      tube([[knee[0] - 0.045, knee[1] - 0.13, knee[2] + 0.015 * side, 0.057, 0.057], [...ankle, 0.04, 0.04]], options(`shin${s}`, 'boot', 0.012)),
      tube([[...ankle, 0.042, 0.04], [ankle[0] + 0.15, ankle[1] - 0.03, ankle[2], 0.03, 0.034]], options(`shin${s}`, 'boot', 0.03)),
    );
  }
  return shapes;
}

// The rider's head, sculpted finer: face looking up the track, skull cap
// with a silk cover, peak and pompom, and racing goggles
export const RIDER_HEAD = [0.47, 2.26, 0];
export function riderHeadShapes() {
  const at = (dx, dy, dz = 0) => [RIDER_HEAD[0] + dx, RIDER_HEAD[1] + dy, RIDER_HEAD[2] + dz];
  const head = (paintName, blend) => options('riderHead', paintName, blend);
  // the cap's rim: lower at the back of the head than over the brow
  const rim = (y0, slope) => {
    const [nx, ny] = [slope, -1].map((v) => v / Math.hypot(slope, 1));
    return [[nx, ny, 0, nx * RIDER_HEAD[0] + ny * (RIDER_HEAD[1] + y0)]];
  };
  return [
    // Neck, rising out of the collar
    tube([[...at(-0.15, -0.115), 0.045, 0.045], [...at(-0.06, -0.06), 0.046, 0.044]], head('skin', 0.03)),
    // Skull, jaw, chin, nose and ears
    ellipsoid(at(-0.01, 0.0), [0.098, 0.102, 0.084], head('skin', 0.04)),
    ellipsoid(at(0.03, -0.045), [0.068, 0.066, 0.066], head('skin', 0.05)),
    ellipsoid(at(0.068, -0.088), [0.034, 0.028, 0.036], head('skin', 0.03)),
    ellipsoid(at(0.104, -0.026), [0.024, 0.032, 0.017], { ...head('skin', 0.015), rotate: [0, 0, -0.35] }),
    ellipsoid(at(0.072, 0.022), [0.022, 0.012, 0.07], head('skin', 0.02)),
    ...sides((s) => [ellipsoid(at(-0.01, -0.02, 0.083 * s), [0.02, 0.03, 0.012], head('skin', 0.015))]),
    // Mouth
    ellipsoid(at(0.088, -0.06), [0.006, 0.004, 0.022], { ...head('inner', 0.008), cut: true }),
    // Skull cap and its silk cover, peak and pompom
    ellipsoid(at(-0.008, 0.03), [0.122, 0.115, 0.108], { ...head('cap', 0.006), clip: rim(0.0, 0.3) }),
    ellipsoid(at(0.1, 0.03), [0.07, 0.011, 0.085], { ...head('peak', 0.008), rotate: [0, 0, -0.18] }),
    ellipsoid(at(-0.022, 0.148), [0.03, 0.028, 0.03], head('pompom', 0.01)),
    // Goggles: a frame and two lenses, on a strap around the cap
    ellipsoid(at(0.08, 0.005), [0.03, 0.034, 0.078], head('goggles', 0.012)),
    ...sides((s) => [ellipsoid(at(0.098, 0.005, 0.034 * s), [0.016, 0.026, 0.03], head('lens', 0.006))]),
    inflate(0.007, (x, y) => Math.abs(y - (RIDER_HEAD[1] + 0.012) + (x - RIDER_HEAD[0]) * 0.32) - 0.016, [0.3, 2.15, -0.16, 0.6, 2.4, 0.16], head('goggles', 0.004)),
  ];
}

// Details that aren't sculpted: eyes, ears, stirrup irons and the number cloth
export const BIT = [...along(0.86, -0.065), 0.072]; // where the reins attach
export const EYE = { center: [...along(0.24, 0.0), 0.1], radius: 0.031 };
export const EAR = { base: [1.265, 2.17, 0.07] };
export const IRON = [RIDER.ankle[0] + 0.07, RIDER.ankle[1] - 0.035, RIDER.ankle[2]];
export const NUMBER_PATCH = { center: [-0.13, 1.42], size: [0.24, 0.2] };

export const HORSE_BOUNDS = [[-1.25, -0.04, -0.42], [1.96, 2.36, 0.42]];
export const JOCKEY_BOUNDS = [[-0.34, 1.4, -0.44], [0.82, 2.3, 0.44]];
export const RIDER_HEAD_BOUNDS = [[0.26, 2.08, -0.16], [0.64, 2.46, 0.16]];
