// Keeps the horses from running through each other.
//
// The race script decides how far along the track each horse is. The pack
// decides where across the track it runs: each horse has its own preferred
// line near the rail, plans ahead to go around horses it's about to catch,
// steers smoothly, and is pushed apart from anyone it touches.
//
// If a horse is completely boxed in, it's held back a little and catches up
// again later. The drawn winner is never held back, and holding a horse back
// only ever makes it slower, so the winner is still guaranteed to finish first.
//
// No Three.js here, so it can be tested in Node.

export const BODY_LENGTH = 3.0; // clearance needed nose to tail, along the track
export const BODY_WIDTH = 1.2; // clearance needed side by side, across the track
export const LOOK_AHEAD = 0.8; // seconds ahead a horse plans its line

const STEER_SPEED = 3.2; // fastest a horse moves across the track (units/s)
const STEER_ACCEL = 9; // how quickly it can change that sideways speed
const HOLD_RATE = 5; // fastest a boxed-in horse is checked (units/s)
const HOLD_RECOVERY = 1; // how quickly it makes the ground back up (units/s)

export function createPack({ ids, winnerId, startY, inside, outside, random = Math.random }) {
  const clamp = (value) => Math.min(outside, Math.max(inside, value));
  const horses = ids.map((id, i) => ({
    id,
    winner: id === winnerId,
    y: startY[i],
    vy: 0,
    hold: 0,
    line: inside + random() ** 1.5 * 5, // most like the rail, a few run wider
    s: 0,
    ahead: 0,
    target: startY[i],
  }));
  const byId = new Map(horses.map((h) => [h.id, h]));

  // Lines that would put this horse into another one, as [from, to] ranges
  function blockedRanges(horse, field) {
    const ranges = [];
    for (const other of field) {
      if (other === horse) continue;
      const alongside = Math.abs(other.s - horse.s) < BODY_LENGTH;
      const catching = other.s >= horse.s && other.ahead - horse.ahead < BODY_LENGTH * 1.1;
      if (alongside || catching) ranges.push([other.y - BODY_WIDTH, other.y + BODY_WIDTH]);
    }
    return ranges;
  }

  // The clear line closest to where the horse is, leaning towards its preferred
  // line. If there's no clear line at all, the horse is boxed in.
  function chooseLine(horse, field) {
    const ranges = blockedRanges(horse, field);
    const isClear = (y) => y >= inside && y <= outside && ranges.every(([from, to]) => y <= from || y >= to);
    const candidates = [horse.line, horse.y];
    for (const [from, to] of ranges) candidates.push(from - 0.02, to + 0.02);

    let best = null;
    let bestCost = Infinity;
    for (const y of candidates) {
      if (!isClear(y)) continue;
      const cost = Math.abs(y - horse.y) + 0.3 * Math.abs(y - horse.line);
      if (cost < bestCost) {
        best = y;
        bestCost = cost;
      }
    }
    horse.boxed = best === null;
    return best ?? horse.y;
  }

  // A boxed-in horse eases off before it runs into the horse in front
  function easeOffIfBoxed(field, dt) {
    for (const horse of field) {
      if (!horse.boxed || horse.winner) continue;
      const inTheWay = field.some(
        (other) => other.s > horse.s && other.s - horse.s < BODY_LENGTH * 1.3 && Math.abs(other.y - horse.y) < BODY_WIDTH,
      );
      if (!inTheWay) continue;
      const check = HOLD_RATE * dt;
      horse.hold += check;
      horse.s -= check;
      horse.ahead -= check;
    }
  }

  // Push overlapping horses apart sideways; the horse behind gives way more
  function separate(field, dt) {
    for (let pass = 0; pass < 6; pass++) {
      for (let i = 0; i < field.length; i++) {
        for (let j = i + 1; j < field.length; j++) {
          const front = field[i];
          const back = field[j];
          if (front.s - back.s >= BODY_LENGTH) break; // sorted, so nobody further back is close
          const dy = back.y - front.y;
          const overlap = BODY_WIDTH - Math.abs(dy);
          if (overlap <= 0) continue;
          const dir = dy !== 0 ? Math.sign(dy) : back.id > front.id ? 1 : -1;
          // Everyone makes way for the winner; otherwise the horse behind gives way more
          const frontShare = back.winner ? 1 : front.winner ? 0 : 0.35;
          const frontY = clamp(front.y - dir * overlap * frontShare);
          const backY = clamp(back.y + dir * overlap * (1 - frontShare));
          // Whatever one horse couldn't take (against a rail), the other takes
          const left = overlap - Math.abs(frontY - front.y) - Math.abs(backY - back.y);
          front.y = clamp(frontY - dir * Math.max(0, left));
          back.y = clamp(backY + dir * Math.max(0, left));
        }
      }
    }

    // Still touching with nowhere to go: check the horse behind (never the winner)
    for (let i = 0; i < field.length; i++) {
      for (let j = i + 1; j < field.length; j++) {
        const front = field[i];
        const back = field[j];
        const ds = front.s - back.s;
        if (ds >= BODY_LENGTH) break;
        if (Math.abs(back.y - front.y) >= BODY_WIDTH - 0.05) continue;
        const slower = back.winner ? front : back;
        if (slower.winner) continue;
        const check = Math.min(BODY_LENGTH - ds, HOLD_RATE * dt);
        slower.hold += check;
        slower.s -= check;
        slower.ahead -= check;
      }
    }
  }

  return {
    // scripted: Map of id -> { s, ahead }, the script's positions now and LOOK_AHEAD from now
    step(dt, scripted) {
      if (dt <= 0) return;
      for (const horse of horses) {
        const { s, ahead } = scripted.get(horse.id);
        horse.s = s - horse.hold;
        horse.ahead = ahead - horse.hold;
      }
      const field = [...horses].sort((a, b) => b.s - a.s);

      for (const horse of field) horse.target = chooseLine(horse, field);
      easeOffIfBoxed(field, dt);
      for (const horse of field) {
        const wanted = Math.max(-STEER_SPEED, Math.min(STEER_SPEED, (horse.target - horse.y) * 2.5));
        horse.vy += Math.max(-STEER_ACCEL * dt, Math.min(STEER_ACCEL * dt, wanted - horse.vy));
        horse.y = clamp(horse.y + horse.vy * dt);
      }
      separate(field, dt);
      for (const horse of horses) horse.hold = Math.max(0, horse.hold - HOLD_RECOVERY * dt);
    },
    // Where a horse is: distance run (after any checking) and line across the track
    get(id) {
      const horse = byId.get(id);
      return { s: horse.s, y: horse.y, vy: horse.vy };
    },
  };
}
