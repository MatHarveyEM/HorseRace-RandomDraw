// Tack: saddle cloth, saddle, girth and bridle, made as thin pieces laid onto
// the sculpted horse (see sculpt.js) so they hug its shape and have crisp
// edges. Each piece borrows the skin weights of the coat beneath it, so it
// moves with the horse. No Three.js here, so it can run in a worker.
import { BIT, EAR, PAINTS, along } from './anatomy.js';

const paint = Object.fromEntries(PAINTS.map((name, i) => [name, i]));
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const length = (a) => Math.hypot(a[0], a[1], a[2]);
const normalize = (a) => scale(a, 1 / (length(a) || 1));
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

function gradient(field, [x, y, z]) {
  const e = 1e-4;
  return normalize([field(x + e, y, z) - field(x - e, y, z), field(x, y + e, z) - field(x, y - e, z), field(x, y, z + e) - field(x, y, z - e)]);
}

// The nearest point on the surface, and the surface normal there
function settle(field, point) {
  let p = point;
  for (let i = 0; i < 3; i++) p = sub(p, scale(gradient(field, p), field(...p)));
  return { point: p, normal: gradient(field, p) };
}

// Where a ray first meets the surface
function cast(field, from, to) {
  let previous = 0;
  const at = (t) => add(from, scale(sub(to, from), t));
  for (let i = 1; i <= 120; i++) {
    const t = i / 120;
    if (field(...at(t)) < 0) {
      let [low, high] = [previous, t];
      for (let k = 0; k < 20; k++) {
        const middle = (low + high) / 2;
        if (field(...at(middle)) < 0) high = middle;
        else low = middle;
      }
      return settle(field, at(high));
    }
    previous = t;
  }
  return settle(field, to);
}

// A smooth path through points (Catmull-Rom), every `spacing` metres
function smoothPath(points, spacing, closed) {
  const n = points.length;
  const get = (i) => (closed ? points[(i + n) % n] : points[Math.min(n - 1, Math.max(0, i))]);
  const out = [];
  const spans = closed ? n : n - 1;
  for (let i = 0; i < spans; i++) {
    const [p0, p1, p2, p3] = [get(i - 1), get(i), get(i + 1), get(i + 2)];
    const steps = Math.max(1, Math.ceil(length(sub(p2, p1)) / spacing));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const [t2, t3] = [t * t, t * t * t];
      out.push([0, 1, 2].map((k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)));
    }
  }
  if (!closed) out.push(points[n - 1]);
  return out;
}

// Collects triangles for tack pieces
function builder() {
  const positions = [];
  const normals = [];
  const paints = [];
  const indices = [];
  const vertex = (point, normal, paintName) => {
    positions.push(...point);
    normals.push(...normal);
    paints.push(paint[paintName]);
    return paints.length - 1;
  };
  // A sheet from rows of [surface point, normal] (rows x columns), raised off
  // the surface, with walls down to the surface along the chosen edges
  const sheet = (grid, raise, paintName, walls = { top: true, bottom: true, left: true, right: true }) => {
    const rows = grid.length;
    const columns = grid[0].length;
    const lifted = grid.map((row) => row.map(({ point, normal }) => vertex(add(point, scale(normal, raise(point))), normal, paintName)));
    // wind the triangles so they face out from the surface
    const [p00, p01, p10] = [grid[0][0], grid[0][1], grid[1][0]];
    const flipped = dot(cross(sub(p01.point, p00.point), sub(p10.point, p00.point)), p00.normal) < 0;
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < columns - 1; c++) {
        const [a, b, d, e] = [lifted[r][c], lifted[r][c + 1], lifted[r + 1][c], lifted[r + 1][c + 1]];
        if (flipped) indices.push(a, e, b, a, d, e);
        else indices.push(a, b, e, a, e, d);
      }
    }
    // Walls show the thickness of the piece at its edges
    const wall = (cells) => {
      for (let i = 0; i < cells.length - 1; i++) {
        const [p, q] = [cells[i], cells[i + 1]];
        const outward = normalize(sub(p.edge, p.inner));
        const top = [p, q].map((cell) => vertex(add(cell.point, scale(cell.normal, raise(cell.point))), outward, paintName));
        const bottom = [p, q].map((cell) => vertex(add(cell.point, scale(cell.normal, -0.004)), outward, paintName));
        if (dot(cross(sub(q.point, p.point), p.normal), outward) > 0) indices.push(top[0], bottom[0], bottom[1], top[0], bottom[1], top[1]);
        else indices.push(top[0], bottom[1], bottom[0], top[0], top[1], bottom[1]);
      }
    };
    const edge = (r, c, ir, ic) => ({ ...grid[r][c], edge: grid[r][c].point, inner: grid[ir][ic].point });
    if (walls.top) wall(grid[0].map((_, c) => edge(0, c, 1, c)));
    if (walls.bottom) wall(grid[rows - 1].map((_, c) => edge(rows - 1, c, rows - 2, c)));
    if (walls.left) wall(grid.map((_, r) => edge(r, 0, r, 1)));
    if (walls.right) wall(grid.map((_, r) => edge(r, columns - 1, r, columns - 2)));
  };
  return { sheet, result: () => ({ positions, normals, paints, indices }) };
}

// A strap of `width` following a path over the surface
function strap(field, build, points, { width, raise, paintName, closed = false, spacing = 0.012 }) {
  const path = smoothPath(points, spacing, closed).map((p) => settle(field, p));
  if (closed) path.push(path[0]);
  const grid = path.map(({ point, normal }, i) => {
    const before = path[Math.max(0, i - 1)].point;
    const after = path[Math.min(path.length - 1, i + 1)].point;
    const side = normalize(cross(normal, sub(after, before)));
    return [-0.5, 0, 0.5].map((k) => settle(field, add(point, scale(side, width * k))));
  });
  build.sheet(grid, () => raise, paintName, { top: !closed, bottom: !closed, left: true, right: true });
}

const ring = (center, a, b, radius, from, to, count) =>
  Array.from({ length: count }, (_, i) => {
    const angle = from + ((to - from) * i) / (count - 1);
    return add(center, add(scale(a, Math.cos(angle) * radius), scale(b, Math.sin(angle) * radius)));
  });

// All the tack for one horse, laid onto its field. detail 0..1 sets how
// finely it's divided up (1 for close-ups, less for distant horses).
export function horseTack(field, detail = 1) {
  const build = builder();
  const n = (count) => Math.max(2, Math.round(count * detail));

  // Saddle cloth: draped over the back, with a band of trim around the edge.
  // Rays come in toward the spine from a circle around it.
  const cloth = { from: 0.0 - 0.3, to: 0.0 + 0.32, sweep: 1.68, trim: 0.045 };
  const drape = (x, angle) => cast(field, [x, 1.3 + Math.cos(angle) * 0.9, Math.sin(angle) * 0.9], [x, 1.3, 0]);
  const area = (x0, x1, a0, a1, columns, rows) =>
    Array.from({ length: rows + 1 }, (_, r) => Array.from({ length: columns + 1 }, (_, c) => drape(x0 + ((x1 - x0) * c) / columns, a0 + ((a1 - a0) * r) / rows)));
  const raise = () => 0.012;
  const trimAngle = cloth.trim / 0.3; // about the same width as the trim along the sides
  const inner = [cloth.from + cloth.trim, cloth.to - cloth.trim];
  const middle = [-cloth.sweep + trimAngle, cloth.sweep - trimAngle];
  build.sheet(area(...inner, ...middle, n(18), n(36)), raise, 'cloth', {});
  for (const side of [1, -1]) {
    const [a0, a1] = side > 0 ? [middle[1], cloth.sweep] : [-cloth.sweep, middle[0]];
    build.sheet(area(cloth.from, cloth.to, a0, a1, n(22), 2), raise, 'clothTrim', side > 0 ? { bottom: true, left: true, right: true } : { top: true, left: true, right: true });
  }
  build.sheet(area(cloth.from, inner[0], ...middle, 2, n(36)), raise, 'clothTrim', { left: true });
  build.sheet(area(inner[1], cloth.to, ...middle, 2, n(36)), raise, 'clothTrim', { right: true });

  // A small racing saddle on top, and the girth around the barrel just behind the elbows
  build.sheet(area(-0.12, 0.18, -0.5, 0.5, n(12), n(12)), (p) => 0.026 + 0.012 * Math.max(0, (p[0] - 0.1) / 0.08), 'saddle');
  const girth = 0.33;
  for (const [a0, a1, lift] of [
    [cloth.sweep - 0.25, Math.PI * 2 - cloth.sweep + 0.25, 0.008],
    [0.5, cloth.sweep - 0.25, 0.022],
    [-cloth.sweep + 0.25, -0.5, 0.022],
  ]) {
    const grid = Array.from({ length: Math.ceil((a1 - a0) / (0.05 / detail)) + 1 }, (_, r) => {
      const angle = a0 + ((a1 - a0) * r) / Math.ceil((a1 - a0) / (0.05 / detail));
      return [girth - 0.035, girth, girth + 0.035].map((x) => drape(x, angle));
    });
    build.sheet(grid, () => lift, 'girth', { left: true, right: true });
  }

  // Bridle: crownpiece behind the ears, browband, cheekpieces down to the bit,
  // noseband and throatlatch
  const [ux, uy] = sub(along(1), along(0)).slice(0, 2).map((v) => v / 0.69);
  const front = [-uy, ux, 0];
  const side = [0, 0, 1];
  const strapOptions = { width: 0.024, raise: 0.006, paintName: 'bridle', spacing: 0.012 / detail };
  const [ex, ey] = EAR.base;
  strap(field, build, [[1.33, 1.98, 0.11], [ex - 0.02, ey - 0.03, 0.1], [ex - 0.05, ey + 0.02, 0.0], [ex - 0.02, ey - 0.03, -0.1], [1.33, 1.98, -0.11]], strapOptions);
  strap(field, build, [[ex + 0.03, ey - 0.04, 0.1], [ex + 0.07, ey - 0.03, 0.0], [ex + 0.03, ey - 0.04, -0.1]], strapOptions);
  for (const s of [1, -1]) {
    strap(field, build, [[1.31, 2.02, 0.11 * s], [1.42, 1.9, 0.1 * s], [1.56, 1.74, 0.085 * s], [BIT[0] - 0.02, BIT[1] + 0.02, BIT[2] * s]], strapOptions);
    strap(field, build, [[1.3, 2.04, 0.1 * s], [1.26, 1.94, 0.07 * s], [1.25, 1.9, 0.0]], strapOptions);
  }
  const nose = add([...along(0.66), 0], scale(front, -0.01));
  strap(field, build, ring(nose, front, side, 0.2, 0, Math.PI * 2, 24), { ...strapOptions, width: 0.03, closed: true });
  return build.result();
}
