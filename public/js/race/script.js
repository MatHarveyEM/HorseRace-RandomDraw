// The race "script": where every horse is at every moment of the race.
//
// The server has already drawn the winner, so the race is choreographed
// backwards from that result. Each horse's distance run is
//
//   s(t) = pace(t) + offset(t)
//
// pace(t) is the speed of the pack, and offset(t) is how far a horse is ahead
// of or behind the pack. Offsets are keyframed every few seconds, with a
// scripted finale over the last few keyframes (a late swoop, a duel, or a
// wire-to-wire win). At the winner's finish time the winner's offset is exactly
// zero and everyone else's is negative, so the winner is always first to the line.
//
// This file has no Three.js dependency so it can be unit tested in Node.

export const CRUISE_SPEED = 22; // track units (metres) per second
export const START_LANES = 8; // horses per row at the start
export const ROW_GAP = 3.2; // distance between rows at the start

const START_ACCEL = 1.2; // seconds to get up to speed out of the gates
const KEYFRAME_SECONDS = 3.2;
const MAX_SURGE_SPEED = 4; // fastest a horse can gain or lose ground on the pack (units/s)
const PULL_UP_SECONDS = 5; // time to slow to a stop after the finish
// No more than this many horses within one body length of each other, so the
// field always fits across the track with room to move
const MAX_ABREAST = 7;
const BODY_LENGTH = 3.0;

export function startingSlot(index) {
  return { lane: index % START_LANES, row: Math.floor(index / START_LANES) };
}

export function createRaceScript({ ids, winnerId, laps, lapLength, random = Math.random }) {
  const count = ids.length;
  const winner = ids.indexOf(winnerId);
  if (count < 2) throw new Error('A race needs at least two horses');
  if (winner === -1) throw new Error('The winner is not in the field');

  const rand = (min, max) => min + (max - min) * random();
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  // Pack pace: accelerate out of the gates, then cruise, scaled so the pack
  // reaches the finish distance exactly at finishTime.
  const distance = laps * lapLength;
  const finishTime = distance / CRUISE_SPEED + START_ACCEL;
  const paceScale = distance / (finishTime - START_ACCEL * (1 - Math.exp(-finishTime / START_ACCEL)));
  const finishSpeed = paceScale * (1 - Math.exp(-finishTime / START_ACCEL));

  // Keyframe times and each horse's offset at each keyframe
  const keyCount = Math.max(5, Math.round(finishTime / KEYFRAME_SECONDS));
  const keyTimes = Array.from({ length: keyCount + 1 }, (_, k) => (finishTime * k) / keyCount);
  const offsets = ids.map((_, i) => {
    const row = new Array(keyCount + 1).fill(0);
    row[0] = -startingSlot(i).row * ROW_GAP;
    return row;
  });

  // Mid-race: each horse has a slowly drifting "form" so leaders change gradually.
  // Bigger fields spread out further so they still fit on the track.
  const spread = clamp(3 + count * 0.5, 5, 30);
  const form = ids.map(() => rand(-1, 1));
  for (let k = 1; k < keyCount; k++) {
    const stringOut = Math.min(1, (k - 1) / 2); // the field strings out after the jump
    for (let i = 0; i < count; i++) {
      form[i] = clamp(form[i] + rand(-0.45, 0.45), -1, 1);
      const settled = spread * (0.75 * form[i] + 0.25 * rand(-1, 1));
      // Out of the gates the rows hold their order, so nobody runs into the row ahead
      offsets[i][k] = stringOut * settled + (1 - stringOut) * (offsets[i][0] + rand(-0.6, 0.6));
    }
  }

  // Finale: pick the rivals and how the last few seconds play out
  const others = ids.map((_, i) => i).filter((i) => i !== winner);
  const byPosition = (k) => [...others].sort((a, b) => offsets[b][k] - offsets[a][k]);
  const contenders = byPosition(keyCount - 3);
  const rival = random() < 0.6 ? contenders[0] : contenders[Math.floor(random() * Math.min(3, contenders.length))];
  const thirdPlace = contenders.find((i) => i !== rival); // undefined in a two-horse race
  const leaders = new Set([winner, rival, thirdPlace]);
  const style = pickStyle(random());

  // Offsets ahead of the rest of the field at the keyframe, for [winner, rival, third]
  const FINALE = {
    swoop: [[-1.0, 2.0, 1.0], [1.0, 2.8, 1.4]], // winner comes from the pack to pip the leader
    duel: [[1.5, 1.6, 0.3], [1.3, 2.1, 0.4]], // neck and neck down the straight
    wire: [[2.5, 1.0, 0.5], [1.6, 1.1, 0.4]], // winner leads, rival closing fast
  };
  FINALE[style].forEach((ahead, step) => {
    const k = keyCount - 2 + step;
    const rest = Math.max(...others.filter((i) => !leaders.has(i)).map((i) => offsets[i][k]), -spread);
    for (const i of others) if (!leaders.has(i)) offsets[i][k] = Math.min(offsets[i][k], rest);
    offsets[winner][k] = rest + ahead[0];
    offsets[rival][k] = rest + ahead[1];
    if (thirdPlace !== undefined) offsets[thirdPlace][k] = rest + ahead[2];
  });

  // Finishing margins: often a photo finish
  const roll = random();
  const margin = roll < 0.5 ? rand(0.08, 0.5) : roll < 0.8 ? rand(0.5, 1.5) : rand(1.5, 3.5);
  const gaps = new Array(count).fill(0);
  gaps[rival] = margin;
  let lastGap = margin;
  if (thirdPlace !== undefined) gaps[thirdPlace] = lastGap = margin + rand(0.3, 1.8);
  const restInOrder = byPosition(keyCount - 1).filter((i) => !leaders.has(i));
  for (const i of restInOrder) gaps[i] = lastGap += rand(0.5, 2.0);
  for (let i = 0; i < count; i++) offsets[i][keyCount] = -gaps[i];

  // Normalise mid-race keyframes so the pack leader sits on the pace line
  for (let k = 1; k < keyCount; k++) {
    const front = Math.max(...offsets.map((row) => row[k]));
    for (const row of offsets) row[k] -= front;
  }

  // Limit how quickly any horse can gain or lose ground, working back from the result
  for (const row of offsets) {
    for (let k = keyCount - 1; k >= 1; k--) {
      const maxStep = MAX_SURGE_SPEED * (keyTimes[k + 1] - keyTimes[k]);
      row[k] = clamp(row[k], row[k + 1] - maxStep, row[k + 1] + maxStep);
    }
  }

  // Thin out any bunch too big to fit across the track by easing the back of it back
  for (let k = 1; k < keyCount; k++) {
    const order = ids.map((_, i) => i).sort((a, b) => offsets[b][k] - offsets[a][k]);
    for (let n = MAX_ABREAST; n < order.length; n++) {
      const limit = offsets[order[n - MAX_ABREAST]][k] - BODY_LENGTH;
      if (offsets[order[n]][k] > limit) offsets[order[n]][k] = limit;
    }
  }

  const tangents = offsets.map((row) => monotoneTangents(keyTimes, row));

  // After the line: keep galloping until everyone is past the post, then pull up
  const maxGap = Math.max(...gaps);
  const pullUpStart = finishTime + maxGap / finishSpeed + 0.4;
  const endTime = pullUpStart + PULL_UP_SECONDS;

  function pace(t) {
    if (t <= finishTime) return paceScale * (t - START_ACCEL * (1 - Math.exp(-t / START_ACCEL)));
    if (t <= pullUpStart) return distance + finishSpeed * (t - finishTime);
    const u = Math.min(t, endTime) - pullUpStart;
    return distance + finishSpeed * (pullUpStart - finishTime) + finishSpeed * u - (finishSpeed / PULL_UP_SECONDS) * u * u * 0.5;
  }

  function offsetAt(i, t) {
    const row = offsets[i];
    if (t <= 0) return row[0];
    if (t >= finishTime) return row[keyCount];
    const k = Math.min(keyCount - 1, Math.floor((t / finishTime) * keyCount));
    return hermite(keyTimes[k], keyTimes[k + 1], row[k], row[k + 1], tangents[i][k], tangents[i][k + 1], t);
  }

  const indexOf = new Map(ids.map((id, i) => [id, i]));
  const finishOrder = [...ids].sort((a, b) => gaps[indexOf.get(a)] - gaps[indexOf.get(b)]);

  return {
    distance,
    finishTime,
    endTime,
    margin,
    style,
    finishOrder,
    // Distance run by a horse at race time t (negative t = waiting at the start)
    positionAt(id, t) {
      const i = indexOf.get(id);
      return t <= 0 ? offsets[i][0] : pace(t) + offsetAt(i, t);
    },
    // Race time at which a horse's nose crosses the finish line
    crossTime(id) {
      return finishTime + gaps[indexOf.get(id)] / finishSpeed;
    },
  };
}

function pickStyle(roll) {
  if (roll < 0.4) return 'swoop';
  if (roll < 0.75) return 'duel';
  return 'wire';
}

// Monotone (Fritsch-Butland) tangents for evenly spaced keyframes: a smooth
// curve through the keyframes that never overshoots them, so a horse can't
// briefly jump past the horse it's chasing.
function monotoneTangents(xs, ys) {
  const n = xs.length;
  const slopes = [];
  for (let k = 0; k < n - 1; k++) slopes.push((ys[k + 1] - ys[k]) / (xs[k + 1] - xs[k]));
  const tangents = new Array(n).fill(0);
  for (let k = 1; k < n - 1; k++) {
    const [a, b] = [slopes[k - 1], slopes[k]];
    if (a * b > 0) tangents[k] = (2 * a * b) / (a + b);
  }
  // Keep closing (or fading) right through the line instead of easing in
  tangents[n - 1] = 0.6 * slopes[n - 2];
  return tangents;
}

function hermite(x0, x1, y0, y1, m0, m1, x) {
  const h = x1 - x0;
  const t = (x - x0) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * h * m0 + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * h * m1;
}
