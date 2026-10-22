// The gallop, worked out the way an animator would: each hoof lands, stays
// planted on the ground while the body passes over it, rolls over the toe and
// lifts off, then folds up and swings forward to land again. The legs reach
// their hooves by inverse kinematics, so planted hooves don't slide.
//
// A right-lead gallop is a four-beat gait: left hind, right hind, left fore,
// right fore, then a moment with all four hooves off the ground. The body
// rocks and bobs over the stride and the neck pumps in time.
//
// Everything is in the horse's side view (x forward, y up), in the same frame
// as anatomy.js. No Three.js here, so it can be tested in Node.
import { FRONT, HIND } from './anatomy.js';

export const STRIDE = 7; // metres covered in one full stride
const STANCE = 0.15; // fraction of the stride each hoof spends on the ground
const PLANTED = STRIDE * STANCE; // how far the body travels over a planted hoof
const BODY = [0, 1.3];
export const FOOTFALLS = { hindL: 0, hindR: 0.09, frontL: 0.3, frontR: 0.39 };

const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const scale = (a, k) => [a[0] * k, a[1] * k];
const length = (a) => Math.hypot(a[0], a[1]);
const heading = (a) => Math.atan2(a[1], a[0]);
const turn = ([x, y], angle) => [x * Math.cos(angle) - y * Math.sin(angle), x * Math.sin(angle) + y * Math.cos(angle)];
const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const smooth = (t) => (t = clamp01(t)) * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;
const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
// A smooth hump from 0 up to 1 at `peak` and back to 0 at `end`
const bump = (t, peak, end = 1) => (t <= 0 || t >= end ? 0 : t < peak ? smooth(t / peak) : 1 - smooth((t - peak) / (end - peak)));

// The middle joint of a two-bone limb from `root` reaching for `target`.
// bend +1 puts the joint in front of the line (a knee), -1 behind it (an elbow).
// Returns the joint and where the end of the limb actually got to.
function reach(root, target, upper, lower, bend) {
  const toTarget = sub(target, root);
  const distance = Math.min(Math.max(length(toTarget), Math.abs(upper - lower) + 1e-4), upper + lower - 1e-4);
  const [ux, uy] = scale(toTarget, 1 / (length(toTarget) || 1));
  const along = (upper * upper + distance * distance - lower * lower) / (2 * distance);
  const out = Math.sqrt(Math.max(0, upper * upper - along * along)) * bend;
  return { joint: [root[0] + ux * along - uy * out, root[1] + uy * along + ux * out], end: [root[0] + ux * distance, root[1] + uy * distance] };
}

// How a bone's direction has turned from where it was sculpted
const swing = (from, to, restFrom, restTo) => wrap(heading(sub(to, from)) - heading(sub(restTo, restFrom)));

const FRONT_LEG = {
  forearm: length(sub(FRONT.knee, FRONT.elbow)),
  cannon: length(sub(FRONT.fetlock, FRONT.knee)),
  upper: length(sub(FRONT.elbow, FRONT.shoulder)),
  landAhead: 0.5, // where the hoof lands, ahead of where it stands
  lift: 0.42, // how high the fetlock comes up as the leg folds
};
const HIND_LEG = {
  femur: length(sub(HIND.stifle, HIND.hip)),
  gaskin: length(sub(HIND.hock, HIND.stifle)),
  landAhead: 0.45,
  lift: 0.26,
};

// Where the hoof is while it's on the ground (0..1 through the stance):
// the toe stays put while the body passes over, the fetlock sinks under the
// load, then the hoof rolls over the toe to push off
function planted(leg, s) {
  const toe = [leg.toe[0] + leg.landAhead - PLANTED * s, 0];
  const roll = -0.75 * smooth((s - 0.55) / 0.45);
  const coronet = sub(toe, turn(sub(leg.toe, leg.coronet), roll));
  const pastern = 0.38 * Math.sin(Math.PI * clamp01(s / 0.9)) + roll * 0.55;
  const fetlock = sub(coronet, turn(sub(leg.coronet, leg.fetlock), pastern));
  return { toe, roll, pastern, fetlock };
}

// Turn a world-frame (horse-frame) angle for each bone into local rotations
function chain(angles) {
  let parent = 0;
  return angles.map((angle) => {
    const local = wrap(angle - parent);
    parent = angle;
    return local;
  });
}

// The pose of the body and every leg at a point in the stride (0..1).
// Returns local z rotations by bone name, plus the body's bob and pitch.
export function gallopPose(stride, effort) {
  const bob = (0.045 * Math.cos(Math.PI * 2 * (stride - 0.78)) - 0.02) * effort;
  const pitch = 0.04 * Math.sin(Math.PI * 2 * (stride + 0.05)) * effort;
  const body = add(BODY, [0, bob]);
  const toHorse = (point) => add(body, turn(sub(point, BODY), pitch)); // body frame -> horse frame
  const pose = { bob, pitch, rotation: {} };
  const hip = toHorse(HIND.hip);
  // The hind cannon follows the sweep of the leg while the hoof is down
  const hindCannon = (fetlock) =>
    0.85 * (Math.atan2(fetlock[0] - hip[0], hip[1] - fetlock[1]) - Math.atan2(HIND.fetlock[0] - HIND.hip[0], HIND.hip[1] - HIND.fetlock[1])) + 0.04;

  for (const [name, offset] of Object.entries(FOOTFALLS)) {
    const front = name.startsWith('front');
    const side = name.slice(-1);
    const leg = front ? { ...FRONT, ...FRONT_LEG } : { ...HIND, ...HIND_LEG };
    const t = (((stride - offset) % 1) + 1) % 1;
    let fetlock;
    let pastern;
    let hoof;
    let knee = 0;
    let cannon = null;
    let tuck = 0; // 0 on the ground, 1 with the lower leg folded in the air
    let flex = 0;
    if (t < STANCE) {
      ({ fetlock, pastern, roll: hoof } = planted(leg, t / STANCE));
    } else {
      // In the air: the fetlock travels from lift-off to the next landing,
      // rising as the leg folds, while the lower leg tucks and then reaches
      const s = (t - STANCE) / (1 - STANCE);
      const off = planted(leg, 1);
      const on = planted(leg, 0);
      fetlock = add(mix(off.fetlock, on.fetlock, smooth(s * 1.08 - 0.04)), [0, leg.lift * bump(s, front ? 0.38 : 0.45, 0.95)]);
      knee = front ? 1.95 * bump(s, 0.36, 0.86) : 0;
      pastern = lerp(off.pastern, on.pastern, smooth(s));
      hoof = lerp(off.roll, on.roll, smooth(s));
      tuck = bump(s, 0.25, 0.88);
      flex = front ? -0.75 : -0.6;
      if (!front) cannon = lerp(hindCannon(off.fetlock), hindCannon(on.fetlock), smooth(s * 1.1 - 0.05)) - 0.5 * bump(s, 0.4, 0.95);
    }

    const angles = {};
    if (front) {
      // The shoulder blade swings with the leg, then the elbow bends to reach
      const scapulaRoot = toHorse(FRONT.scapula);
      const sweep = Math.atan2(fetlock[0] - scapulaRoot[0], scapulaRoot[1] - fetlock[1]) - Math.atan2(FRONT.fetlock[0] - FRONT.scapula[0], FRONT.scapula[1] - FRONT.fetlock[1]);
      const scapula = pitch + 0.42 * sweep;
      const shoulder = add(scapulaRoot, turn(sub(FRONT.shoulder, FRONT.scapula), scapula));
      // forearm + cannon act as one strut whose length depends on the knee
      const strut = Math.sqrt(leg.forearm ** 2 + leg.cannon ** 2 + 2 * leg.forearm * leg.cannon * Math.cos(knee));
      const { joint: elbow, end } = reach(shoulder, fetlock, leg.upper, strut, -1);
      const { joint: kneeJoint } = reach(elbow, end, leg.forearm, leg.cannon, 1);
      angles.scapula = scapula;
      angles.humerus = swing(shoulder, elbow, FRONT.shoulder, FRONT.elbow);
      angles.forearm = swing(elbow, kneeJoint, FRONT.elbow, FRONT.knee);
      angles.cannon = swing(kneeJoint, end, FRONT.knee, FRONT.fetlock);
    } else {
      if (cannon === null) cannon = hindCannon(fetlock);
      const hock = sub(fetlock, turn(sub(HIND.fetlock, HIND.hock), cannon));
      const { joint: stifle, end } = reach(hip, hock, leg.femur, leg.gaskin, 1);
      angles.femur = swing(hip, stifle, HIND.hip, HIND.stifle);
      angles.gaskin = swing(stifle, end, HIND.stifle, HIND.hock);
      angles.cannon = cannon;
    }
    // In the air the pastern and hoof curl back from the cannon
    pastern = lerp(pastern, angles.cannon + flex, tuck);
    hoof = lerp(hoof, pastern + flex * 0.6, tuck);
    angles.pastern = pastern;
    angles.hoof = hoof;

    const names = front
      ? [`scapula${side}`, `humerus${side}`, `forearm${side}`, `cannon${side}`, `pastern${side}`, `hoof${side}`]
      : [`femur${side}`, `gaskin${side}`, `hock${side}`, `hindPastern${side}`, `hindHoof${side}`];
    const world = front
      ? [angles.scapula, angles.humerus, angles.forearm, angles.cannon, angles.pastern, angles.hoof]
      : [angles.femur, angles.gaskin, angles.cannon, angles.pastern, angles.hoof];
    // relative to the body, which is pitched; at rest everything is zero
    const local = chain([pitch, ...world]).slice(1);
    names.forEach((bone, i) => (pose.rotation[bone] = local[i] * effort));
  }

  // Neck pumps with the stride; the head stays steadier
  const nod = Math.sin(Math.PI * 2 * (stride - 0.12));
  pose.rotation.neck = (-0.12 + 0.07 * nod) * effort;
  pose.rotation.head = (0.06 - 0.04 * nod) * effort;
  pose.nod = nod;
  pose.rotation.body = pitch;
  return pose;
}
