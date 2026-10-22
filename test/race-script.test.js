import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRaceScript } from '../public/js/race/script.js';

const LAP_LENGTH = 296;

// Small seeded random number generator so failures are reproducible
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

function* races() {
  let seed = 1;
  for (const count of [2, 3, 5, 8, 12, 24, 50]) {
    for (const laps of [1, 2, 3, 5]) {
      for (let run = 0; run < 12; run++) {
        const random = seeded(seed++);
        const ids = Array.from({ length: count }, (_, i) => i + 1);
        const winnerId = ids[Math.floor(random() * count)];
        yield { ids, winnerId, laps, script: createRaceScript({ ids, winnerId, laps, lapLength: LAP_LENGTH, random }) };
      }
    }
  }
}

test('the drawn winner is always first past the post', () => {
  for (const { ids, winnerId, script } of races()) {
    assert.equal(script.finishOrder[0], winnerId);
    const winnerCross = script.crossTime(winnerId);
    assert.equal(winnerCross, script.finishTime);
    assert.ok(Math.abs(script.positionAt(winnerId, script.finishTime) - script.distance) < 1e-6);
    for (const id of ids) {
      if (id === winnerId) continue;
      assert.ok(script.crossTime(id) > winnerCross, `horse ${id} crossed before the winner`);
      assert.ok(script.positionAt(id, script.finishTime) < script.distance, `horse ${id} was past the line first`);
    }
  }
});

test('nobody reaches the line before the winner, at any moment', () => {
  for (const { ids, winnerId, script } of races()) {
    for (let t = 0; t < script.finishTime; t += 1 / 60) {
      for (const id of ids) {
        assert.ok(script.positionAt(id, t) < script.distance, `horse ${id} (winner ${winnerId}) hit the line at t=${t}`);
      }
    }
  }
});

test('horses only ever move forwards', () => {
  for (const { ids, script } of races()) {
    for (const id of ids) {
      let previous = script.positionAt(id, -1);
      for (let t = -1; t <= script.endTime + 1; t += 1 / 120) {
        const s = script.positionAt(id, t);
        assert.ok(s >= previous - 1e-9, `horse ${id} went backwards at t=${t}`);
        previous = s;
      }
    }
  }
});

test('the finish order matches crossing times and the margin', () => {
  for (const { script } of races()) {
    const times = script.finishOrder.map((id) => script.crossTime(id));
    for (let i = 1; i < times.length; i++) assert.ok(times[i] >= times[i - 1]);
    assert.ok(script.margin > 0);
  }
});

test('rejects a winner who is not in the field', () => {
  assert.throws(() => createRaceScript({ ids: [1, 2], winnerId: 3, laps: 1, lapLength: LAP_LENGTH }));
});
