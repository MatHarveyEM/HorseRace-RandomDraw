import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCaller } from '../public/js/race/caller.js';
import { createRaceScript } from '../public/js/race/script.js';

const LAP_LENGTH = 296;
const DT = 1 / 30;

function callRace({ count, laps, seed }) {
  let a = seed;
  const random = () => ((a = (a * 16807) % 2147483647) - 1) / 2147483646;
  const ids = Array.from({ length: count }, (_, i) => i + 1);
  const winnerId = ids[Math.floor(random() * count)];
  const script = createRaceScript({ ids, winnerId, laps, lapLength: LAP_LENGTH, random });
  const caller = createCaller({
    laps,
    distance: script.distance,
    lapLength: LAP_LENGTH,
    landmarks: { backStraight: 196, homeTurn: 136, straight: 48 },
    horseLength: 2.7,
    style: script.style,
    close: script.margin < 1.2,
    winnerId,
    random,
  });
  const names = new Map(ids.map((id) => [id, `Runner ${id}`]));
  const calls = [{ time: -1, ...caller.loading(ids) }, { time: 0, ...caller.jump() }];
  for (let t = DT; t < script.finishTime; t += DT) {
    const field = ids
      .map((id) => ({ id, name: names.get(id), s: script.positionAt(id, t), y: 1 + (id % 12) }))
      .sort((x, y) => y.s - x.s);
    const said = caller.update(t, field, script.finishTime - t);
    if (said) calls.push({ time: t, toLine: script.finishTime - t, leader: field[0].id, ...said });
  }
  return { calls, winnerName: names.get(winnerId), script };
}

test('the caller never names the winner as winning before the line', () => {
  let seed = 7;
  for (const count of [2, 5, 12, 24]) {
    for (const laps of [1, 3, 5]) {
      for (let run = 0; run < 10; run++) {
        const { calls, winnerName } = callRace({ count, laps, seed: seed++ });
        for (const c of calls) {
          if (/\bwins?\b|going to win/.test(c.text)) {
            assert.ok(c.toLine < 0.9, `"${c.text}" called ${c.toLine?.toFixed(2)}s out`);
            if (/going to win/.test(c.text)) assert.ok(c.text.startsWith(winnerName));
          }
        }
      }
    }
  }
});

test('the call keeps going and builds to the finish', () => {
  let seed = 101;
  for (const laps of [1, 3]) {
    for (let run = 0; run < 8; run++) {
      const { calls, script } = callRace({ count: 10, laps, seed: seed++ });
      const times = calls.map((c) => c.time);
      for (let i = 1; i < times.length; i++) assert.ok(times[i] - times[i - 1] < 10, `silent for ${(times[i] - times[i - 1]).toFixed(1)}s`);
      assert.ok(calls.some((c) => c.text.startsWith('Around the home turn')), 'no home turn call');
      assert.ok(calls.some((c) => c.text.startsWith('Into the straight')), 'no straight call');
      assert.ok(calls.some((c) => c.toLine !== undefined && c.toLine < 0.9 && c.urgent), 'no call at the line');
      if (laps > 1) assert.ok(calls.some((c) => c.text.includes('bell')), 'no bell');
      assert.ok(script.finishTime - times.at(-1) < 1, 'went quiet before the line');
    }
  }
});

test('"here comes" names the horse that goes on to win', () => {
  let seed = 500;
  for (let run = 0; run < 40; run++) {
    const { calls, winnerName } = callRace({ count: 8, laps: 1, seed: seed++ });
    for (const c of calls) if (c.text.startsWith('And here comes')) assert.ok(c.text.includes(winnerName));
  }
});
