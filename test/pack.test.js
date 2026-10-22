import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LOOK_AHEAD, createPack } from '../public/js/race/pack.js';
import { START_LANES, createRaceScript, startingSlot } from '../public/js/race/script.js';

const LAP_LENGTH = 296;
const INSIDE = 0.8;
const OUTSIDE = 15.2;
const LANE_WIDTH = 1.75;
const DT = 1 / 60;
// Two horses visibly clip when their centres are this close along and across the track
const CLIP_LENGTH = 2.5;
const CLIP_WIDTH = 0.8;

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Runs a whole race through the pack, frame by frame, like the browser does
function simulate({ count, laps, seed }) {
  const random = seeded(seed);
  const ids = Array.from({ length: count }, (_, i) => i + 1);
  const winnerId = ids[Math.floor(random() * count)];
  const script = createRaceScript({ ids, winnerId, laps, lapLength: LAP_LENGTH, random });
  const startY = ids.map((_, i) => INSIDE + 0.1 + startingSlot(i).lane * LANE_WIDTH);
  const pack = createPack({ ids, winnerId, startY, inside: INSIDE, outside: OUTSIDE, random });

  const stats = { frames: 0, overlapFrames: 0, winnerHeld: false, offTrack: false };
  for (let t = DT; t < script.finishTime + 1.5; t += DT) {
    const scripted = new Map(ids.map((id) => [id, { s: script.positionAt(id, t), ahead: script.positionAt(id, t + LOOK_AHEAD) }]));
    pack.step(DT, scripted);
    const now = ids.map((id) => ({ id, ...pack.get(id) }));

    let overlapped = false;
    for (let i = 0; i < now.length; i++) {
      for (let j = i + 1; j < now.length; j++) {
        const ds = Math.abs(now[i].s - now[j].s);
        const dy = Math.abs(now[i].y - now[j].y);
        if (ds < CLIP_LENGTH && dy < CLIP_WIDTH) overlapped = true;
      }
    }
    for (const h of now) {
      if (h.y < INSIDE - 1e-9 || h.y > OUTSIDE + 1e-9) stats.offTrack = true;
      if (h.id === winnerId && Math.abs(h.s - scripted.get(h.id).s) > 1e-9) stats.winnerHeld = true;
    }
    stats.frames++;
    if (overlapped) stats.overlapFrames++;
  }
  return stats;
}

function clipRate(counts, runs) {
  let frames = 0;
  let overlapFrames = 0;
  let seed = counts[0] * 100;
  for (const count of counts) {
    for (const laps of [1, 3]) {
      for (let run = 0; run < runs; run++) {
        const stats = simulate({ count, laps, seed: seed++ });
        frames += stats.frames;
        overlapFrames += stats.overlapFrames;
        assert.ok(!stats.offTrack, 'a horse left the track');
        assert.ok(!stats.winnerHeld, 'the winner was held back');
      }
    }
  }
  return overlapFrames / frames;
}

test('horses do not run through each other in fields of up to 24', () => {
  const rate = clipRate([2, 6, 10, 16, 24], 4);
  assert.ok(rate < 0.001, `horses clipped in ${(rate * 100).toFixed(2)}% of frames`);
});

test('even a 50-horse field rarely touches', () => {
  const rate = clipRate([50], 3);
  assert.ok(rate < 0.03, `horses clipped in ${(rate * 100).toFixed(2)}% of frames`);
});

test('a full front row starts side by side without touching', () => {
  const stats = simulate({ count: START_LANES, laps: 1, seed: 99 });
  assert.equal(stats.overlapFrames, 0);
});
