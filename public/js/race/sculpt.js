// Digital clay for the horses and riders.
//
// A model is described the way a sculptor builds one: rounded masses
// (ellipsoids and tapering tubes for muscles, bones and tendons) blended
// smoothly into each other, with hollows cut away (eye sockets, nostrils) and
// tack laid over the top (a saddle cloth or girth is the body surface puffed
// out a little inside a region). Mathematically each shape is a signed
// distance field: negative inside, positive outside.
//
// sculpt() turns the blended field into one seamless triangle mesh using
// surface nets on a grid, then snaps every vertex onto the true surface and
// takes its normal from the field's gradient, so curves stay smooth however
// coarse the grid is. It also bakes ambient occlusion (soft shading in creases)
// and works out, for every vertex, which bones of the skeleton move it and
// which paint (coat, mane, hoof, silks...) it gets.
//
// No Three.js here, so it runs (and is tested) in Node too.

const BLOCK = 4; // grid cells per block when skipping empty space

// Polynomial smooth minimum: blends two surfaces over a distance k
function smin(a, b, k) {
  if (k <= 0) return a < b ? a : b;
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return (a < b ? a : b) - h * h * k * 0.25;
}

// Approximate distance to an ellipsoid at the origin with radii (a, b, c)
function ellipsoidDistance(x, y, z, a, b, c) {
  const [u, v, w] = [x / a, y / b, z / c];
  const k0 = Math.sqrt(u * u + v * v + w * w);
  const k1 = Math.sqrt((u * u) / (a * a) + (v * v) / (b * b) + (w * w) / (c * c));
  return k1 < 1e-9 ? -Math.min(a, b, c) : (k0 * (k0 - 1)) / k1;
}

// Rotation matrix (row-major 3x3) from Euler angles in XYZ order, as Three.js does
function rotation([rx, ry, rz]) {
  const [a, b, c, d, e, f] = [Math.cos(rx), Math.sin(rx), Math.cos(ry), Math.sin(ry), Math.cos(rz), Math.sin(rz)];
  return [c * e, -c * f, d, a * f + b * e * d, a * e - b * f * d, -b * c, b * f - a * e * d, b * e + a * f * d, a * c];
}

function shape(kind, dist, bounds, { bone = 0, paint = 0, blend = 0.04, cut = false, clip = [] } = {}) {
  if (bounds.some(Number.isNaN)) throw new Error(`A ${kind} has a position that isn't a number`);
  const clipped = clip.length
    ? (x, y, z) => {
        let d = dist(x, y, z);
        for (const [nx, ny, nz, offset] of clip) d = Math.max(d, nx * x + ny * y + nz * z - offset);
        return d;
      }
    : dist;
  return { kind, dist: clipped, bounds: Float64Array.from(bounds), bone, paint, blend, cut };
}

// An ellipsoid: center [x, y, z], radii [a, b, c], optional rotation [rx, ry, rz]
export function ellipsoid(center, radii, { rotate = [0, 0, 0], ...options } = {}) {
  const [cx, cy, cz] = center;
  const [a, b, c] = radii;
  const m = rotation(rotate);
  const dist = (x, y, z) => {
    const px = x - cx;
    const py = y - cy;
    const pz = z - cz;
    // into the ellipsoid's own frame (transpose = inverse rotation)
    return ellipsoidDistance(m[0] * px + m[3] * py + m[6] * pz, m[1] * px + m[4] * py + m[7] * pz, m[2] * px + m[5] * py + m[8] * pz, a, b, c);
  };
  const r = Math.max(a, b, c);
  return shape('ellipsoid', dist, [cx - r, cy - r, cz - r, cx + r, cy + r, cz + r], options);
}

// A tube through points [[x, y, z, ry, rz], ...] with an oval cross-section
// that changes size along the way: ry is the half-depth in the plane of the
// bend (facing "up" from the path, toward +y for a horizontal tube, toward +x
// for a vertical one) and rz the half-width sideways. Ends are rounded.
export function tube(points, options) {
  const segments = [];
  const bounds = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, ay, az, ary, arz] = points[i];
    const [bx, by, bz, bry, brz] = points[i + 1];
    let [tx, ty, tz] = [bx - ax, by - ay, bz - az];
    const length2 = tx * tx + ty * ty + tz * tz;
    const length = Math.sqrt(length2);
    [tx, ty, tz] = [tx / length, ty / length, tz / length];
    // Sideways is as close to +z as the path allows (or +x for a path along z)
    let [sx, sy, sz] = Math.abs(tz) > 0.99 ? [1 - tx * tx, -tx * ty, -tx * tz] : [-tz * tx, -tz * ty, 1 - tz * tz];
    const s = Math.hypot(sx, sy, sz);
    [sx, sy, sz] = [sx / s, sy / s, sz / s];
    // "Up" is square to both
    const [ux, uy, uz] = [sy * tz - sz * ty, sz * tx - sx * tz, sx * ty - sy * tx];
    segments.push({ ax, ay, az, tx, ty, tz, length, sx, sy, sz, ux, uy, uz, ary, arz, dry: bry - ary, drz: brz - arz });
    const r = Math.max(ary, arz, bry, brz);
    for (const [x, y, z] of [points[i], points[i + 1]]) {
      bounds[0] = Math.min(bounds[0], x - r);
      bounds[1] = Math.min(bounds[1], y - r);
      bounds[2] = Math.min(bounds[2], z - r);
      bounds[3] = Math.max(bounds[3], x + r);
      bounds[4] = Math.max(bounds[4], y + r);
      bounds[5] = Math.max(bounds[5], z + r);
    }
  }
  const dist = (x, y, z) => {
    let best = Infinity;
    for (const g of segments) {
      const px = x - g.ax;
      const py = y - g.ay;
      const pz = z - g.az;
      const along = px * g.tx + py * g.ty + pz * g.tz;
      const t = Math.min(Math.max(along / g.length, 0), 1);
      const ry = g.ary + g.dry * t;
      const rz = g.arz + g.drz * t;
      const d = ellipsoidDistance(along - t * g.length, px * g.ux + py * g.uy + pz * g.uz, px * g.sx + py * g.sy + pz * g.sz, Math.min(ry, rz), ry, rz);
      if (d < best) best = d;
    }
    return best;
  };
  return shape('tube', dist, bounds, options);
}

// Puff the surface out by `amount` inside a region, for tack laid over the
// body. region(x, y, z) is negative inside; bounds limit where it applies.
export function inflate(amount, region, bounds, options) {
  const s = shape('inflate', region, bounds, { blend: 0.004, ...options });
  s.amount = amount;
  return s;
}

// How far a box (x0..x1, y0..y1, z0..z1) is from a shape's bounds
function gap(b, x0, y0, z0, x1, y1, z1) {
  const dx = Math.max(b[0] - x1, x0 - b[3], 0);
  const dy = Math.max(b[1] - y1, y0 - b[4], 0);
  const dz = Math.max(b[2] - z1, z0 - b[5], 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// ...and from a point
function gapTo(b, x, y, z) {
  const dx = b[0] - x > x - b[3] ? b[0] - x : x - b[3];
  const dy = b[1] - y > y - b[4] ? b[1] - y : y - b[4];
  const dz = b[2] - z > z - b[5] ? b[2] - z : z - b[5];
  return Math.sqrt((dx > 0 ? dx * dx : 0) + (dy > 0 ? dy * dy : 0) + (dz > 0 ? dz * dz : 0));
}

// Evaluate the blended field at a point using a list of shapes. Shapes too far
// away to change the result are skipped using their bounds.
function evaluate(list, x, y, z, closeness) {
  let d = 1e9;
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    const lower = gapTo(s.bounds, x, y, z);
    let own;
    if (s.kind === 'inflate') {
      if (lower > 0) continue;
      own = Math.max(d - s.amount, s.dist(x, y, z));
      d = smin(d, own, s.blend);
      if (closeness) closeness[i] = Math.abs(own);
      continue;
    }
    if (s.cut) {
      if (!closeness && lower >= s.blend - d) continue;
      own = s.dist(x, y, z);
      d = -smin(-d, own, s.blend);
      if (closeness) closeness[i] = Math.abs(own);
    } else {
      if (!closeness && lower >= d + s.blend) continue;
      own = s.dist(x, y, z);
      d = smin(d, own, s.blend);
      if (closeness) closeness[i] = Math.abs(own);
    }
  }
  return d;
}

// Turn shapes into a mesh.
//   bounds: [[x0, y0, z0], [x1, y1, z1]], with room around the model
//   step: grid spacing (smaller = more detail, more triangles)
//   parents: parent bone index for each bone (-1 for the root), so a vertex is
//            only moved by bones next to the one it belongs to
//   explicitBones: bones whose shapes don't share skin with their neighbours
// Returns typed arrays: positions, normals, indices, ao, skinIndex, skinWeight,
// paintA, paintB, paintMix (how much of paint B shows).
export function sculpt(shapes, { bounds: [min, max], step, parents = [-1], skinSoftness = 0.035, paintSoftness = 0.004, smoothing = 0.05, band = 0.16 }) {
  const [x0, y0, z0] = min;
  const nx = Math.ceil((max[0] - x0) / step) + 1;
  const ny = Math.ceil((max[1] - y0) / step) + 1;
  const nz = Math.ceil((max[2] - z0) / step) + 1;
  const bnx = Math.ceil((nx - 1) / BLOCK);
  const bny = Math.ceil((ny - 1) / BLOCK);
  const bnz = Math.ceil((nz - 1) / BLOCK);
  const blockSize = BLOCK * step;

  // The shapes that matter in each block of space
  const lists = new Array(bnx * bny * bnz);
  for (let bz = 0; bz < bnz; bz++) {
    for (let by = 0; by < bny; by++) {
      for (let bx = 0; bx < bnx; bx++) {
        const lx = x0 + bx * blockSize;
        const ly = y0 + by * blockSize;
        const lz = z0 + bz * blockSize;
        lists[bx + bnx * (by + bny * bz)] = shapes.filter((s) => gap(s.bounds, lx, ly, lz, lx + blockSize, ly + blockSize, lz + blockSize) < band + s.blend);
      }
    }
  }
  const listAt = (x, y, z) => {
    const bx = Math.min(bnx - 1, Math.max(0, Math.floor((x - x0) / blockSize)));
    const by = Math.min(bny - 1, Math.max(0, Math.floor((y - y0) / blockSize)));
    const bz = Math.min(bnz - 1, Math.max(0, Math.floor((z - z0) / blockSize)));
    return lists[bx + bnx * (by + bny * bz)];
  };
  const field = (x, y, z) => evaluate(listAt(x, y, z), x, y, z);

  // Sample the grid, skipping blocks that are nowhere near the surface
  const values = new Float32Array(nx * ny * nz).fill(NaN);
  const active = new Uint8Array(bnx * bny * bnz);
  const reach = (BLOCK * 0.87 + 1.5) * step * 1.3;
  for (let bz = 0; bz < bnz; bz++) {
    for (let by = 0; by < bny; by++) {
      for (let bx = 0; bx < bnx; bx++) {
        const b = bx + bnx * (by + bny * bz);
        const centre = lists[b].length ? field(x0 + (bx + 0.5) * blockSize, y0 + (by + 0.5) * blockSize, z0 + (bz + 0.5) * blockSize) : 1;
        const live = Math.abs(centre) < reach;
        active[b] = live ? 1 : 0;
        for (let k = bz * BLOCK; k <= Math.min(nz - 1, bz * BLOCK + BLOCK); k++) {
          for (let j = by * BLOCK; j <= Math.min(ny - 1, by * BLOCK + BLOCK); j++) {
            for (let i = bx * BLOCK; i <= Math.min(nx - 1, bx * BLOCK + BLOCK); i++) {
              const n = i + nx * (j + ny * k);
              if (live) {
                if (Number.isNaN(values[n]) || values[n] === reach || values[n] === -reach) values[n] = evaluate(lists[b], x0 + i * step, y0 + j * step, z0 + k * step);
              } else if (Number.isNaN(values[n])) {
                values[n] = centre > 0 ? reach : -reach;
              }
            }
          }
        }
      }
    }
  }

  // One vertex per cell that the surface passes through (surface nets)
  const cx = nx - 1;
  const cxy = (nx - 1) * (ny - 1);
  const cellIndex = new Int32Array(cxy * (nz - 1)).fill(-1);
  const offsets = [];
  const unit = [];
  for (let c = 0; c < 8; c++) {
    unit.push(c & 1, (c >> 1) & 1, (c >> 2) & 1);
    offsets.push((c & 1) + nx * (((c >> 1) & 1) + ny * ((c >> 2) & 1)));
  }
  const edgeA = [];
  const edgeB = [];
  for (let a = 0; a < 8; a++) {
    for (const bit of [1, 2, 4]) {
      if (a & bit) continue;
      edgeA.push(a);
      edgeB.push(a | bit);
    }
  }
  const position = [];
  const cells = []; // [cell, mask] for every cell with a vertex
  const corner = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) {
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const base = i + nx * (j + ny * k);
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          corner[c] = values[base + offsets[c]];
          if (corner[c] < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0;
        let sy = 0;
        let sz = 0;
        let crossings = 0;
        for (let e = 0; e < 12; e++) {
          const a = edgeA[e];
          const b = edgeB[e];
          if (((mask >> a) & 1) === ((mask >> b) & 1)) continue;
          const t = corner[a] / (corner[a] - corner[b]);
          sx += unit[a * 3] + (unit[b * 3] - unit[a * 3]) * t;
          sy += unit[a * 3 + 1] + (unit[b * 3 + 1] - unit[a * 3 + 1]) * t;
          sz += unit[a * 3 + 2] + (unit[b * 3 + 2] - unit[a * 3 + 2]) * t;
          crossings++;
        }
        const c = i + cx * j + cxy * k;
        cellIndex[c] = position.length / 3;
        cells.push(c, mask);
        position.push(x0 + (i + sx / crossings) * step, y0 + (j + sy / crossings) * step, z0 + (k + sz / crossings) * step);
      }
    }
  }

  // A quad (two triangles) across every grid edge the surface crosses. Each
  // cell owns the three edges at its lowest corner, shared with the cells
  // behind it along the other two axes.
  const indices = [];
  const p = (v, axis) => position[v * 3 + axis];
  const diagonal = (u, v) => (p(u, 0) - p(v, 0)) ** 2 + (p(u, 1) - p(v, 1)) ** 2 + (p(u, 2) - p(v, 2)) ** 2;
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) [b, d] = [d, b];
    if (diagonal(a, c) <= diagonal(b, d)) indices.push(a, b, c, a, c, d);
    else indices.push(a, b, d, b, c, d);
  };
  for (let n = 0; n < cells.length; n += 2) {
    const c = cells[n];
    const mask = cells[n + 1];
    const i = c % cx;
    const j = Math.floor(c / cx) % (ny - 1);
    const k = Math.floor(c / cxy);
    const inside = (mask & 1) !== 0;
    // along x: the cells at (j-1, k-1), (j, k-1), (j, k), (j-1, k)
    if (j > 0 && k > 0 && inside !== ((mask & 2) !== 0)) quad(cellIndex[c - cx - cxy], cellIndex[c - cxy], cellIndex[c], cellIndex[c - cx], !inside);
    // along y: (i-1, k-1), (i-1, k), (i, k), (i, k-1)
    if (i > 0 && k > 0 && inside !== ((mask & 4) !== 0)) quad(cellIndex[c - 1 - cxy], cellIndex[c - 1], cellIndex[c], cellIndex[c - cxy], !inside);
    // along z: (i-1, j-1), (i, j-1), (i, j), (i-1, j)
    if (i > 0 && j > 0 && inside !== ((mask & 16) !== 0)) quad(cellIndex[c - 1 - cx], cellIndex[c - cx], cellIndex[c], cellIndex[c - 1], !inside);
  }

  // Snap each vertex onto the true surface and take its normal from the gradient
  const count = position.length / 3;
  const positions = new Float32Array(position);
  const normals = new Float32Array(count * 3);
  const e = step * 0.2;
  const gradient = (x, y, z, out) => {
    const list = listAt(x, y, z);
    out[0] = evaluate(list, x + e, y, z) - evaluate(list, x - e, y, z);
    out[1] = evaluate(list, x, y + e, z) - evaluate(list, x, y - e, z);
    out[2] = evaluate(list, x, y, z + e) - evaluate(list, x, y, z - e);
    return Math.hypot(out[0], out[1], out[2]) || 1;
  };
  const g = [0, 0, 0];
  for (let v = 0; v < count; v++) {
    let x = positions[v * 3];
    let y = positions[v * 3 + 1];
    let z = positions[v * 3 + 2];
    const [ox, oy, oz] = [x, y, z];
    for (let iteration = 0; iteration < 3; iteration++) {
      const d = field(x, y, z);
      const length = gradient(x, y, z, g) / (2 * e);
      const move = d / (length * length * 2 * e);
      x -= g[0] * move;
      y -= g[1] * move;
      z -= g[2] * move;
    }
    // Never wander more than a cell from where surface nets put it
    const drift = Math.hypot(x - ox, y - oy, z - oz);
    if (drift > step) {
      const t = step / drift;
      [x, y, z] = [ox + (x - ox) * t, oy + (y - oy) * t, oz + (z - oz) * t];
    }
    positions.set([x, y, z], v * 3);
    const length = gradient(x, y, z, g);
    normals.set([g[0] / length, g[1] / length, g[2] / length], v * 3);
  }

  // Ambient occlusion: how much the field closes in just outside each vertex
  const ao = new Float32Array(count);
  for (let v = 0; v < count; v++) {
    const [x, y, z] = positions.subarray(v * 3, v * 3 + 3);
    const [mx, my, mz] = normals.subarray(v * 3, v * 3 + 3);
    let occlusion = 0;
    for (let s = 1; s <= 5; s++) {
      const distance = s * 0.035;
      occlusion += (distance - Math.min(distance, field(x + mx * distance, y + my * distance, z + mz * distance))) / 2 ** s;
    }
    ao[v] = Math.max(0, 1 - occlusion * 7);
  }

  // Bones and paints from whichever shapes each vertex is closest to
  const boneCount = parents.length;
  const weights = new Float32Array(count * boneCount);
  const paintA = new Uint8Array(count);
  const paintB = new Uint8Array(count);
  const paintMix = new Float32Array(count);
  const neighbours = parents.map((parent, bone) => new Set([bone, parent, ...parents.flatMap((p, child) => (p === bone ? [child] : []))]));
  for (let v = 0; v < count; v++) {
    const [x, y, z] = positions.subarray(v * 3, v * 3 + 3);
    const list = listAt(x, y, z);
    const closeness = new Float32Array(list.length).fill(Infinity);
    evaluate(list, x, y, z, closeness);
    let nearest = 0;
    for (let i = 1; i < list.length; i++) if (closeness[i] < closeness[nearest]) nearest = i;
    const home = list[nearest].bone;
    const bones = new Map();
    const paints = new Map();
    for (let i = 0; i < list.length; i++) {
      const offset = closeness[i] - closeness[nearest];
      if (!Number.isFinite(offset)) continue;
      const s = list[i];
      if (neighbours[home].has(s.bone)) bones.set(s.bone, (bones.get(s.bone) ?? 0) + Math.exp(-offset / skinSoftness));
      paints.set(s.paint, Math.max(paints.get(s.paint) ?? 0, Math.exp(-offset / paintSoftness)));
    }
    let total = 0;
    for (const w of bones.values()) total += w;
    for (const [bone, w] of bones) weights[v * boneCount + bone] = w / total;
    const [[a, wa], [b, wb] = [a, 0]] = [...paints].sort((p, q) => q[1] - p[1]);
    paintA[v] = a;
    paintB[v] = b;
    paintMix[v] = wb / (wa + wb);
  }

  // Let the weights spread a little across the surface (never through the air
  // between legs), so joints bend without creases
  const { skinIndex, skinWeight } = smoothWeights(weights, boneCount, indices, count, Math.ceil(2 * (smoothing / step) ** 2));

  return { positions, normals, indices: new Uint32Array(indices), ao, skinIndex, skinWeight, paintA, paintB, paintMix, field };
}

// Diffuse per-vertex bone weights over the mesh, then keep the strongest four
function smoothWeights(weights, boneCount, indices, count, iterations) {
  // Each vertex's neighbours, from the triangles
  const degree = new Uint32Array(count + 1);
  for (const v of indices) degree[v + 1] += 2;
  for (let v = 0; v < count; v++) degree[v + 1] += degree[v];
  const neighbours = new Uint32Array(degree[count]);
  const fill = degree.slice(0, count);
  for (let t = 0; t < indices.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = indices[t + e];
      const b = indices[t + ((e + 1) % 3)];
      neighbours[fill[a]++] = b;
      neighbours[fill[b]++] = a;
    }
  }
  // Only bones that are actually used, and only vertices near a change of bone
  const used = [];
  for (let b = 0; b < boneCount; b++) {
    for (let v = 0; v < count; v++) {
      if (weights[v * boneCount + b] > 0) {
        used.push(b);
        break;
      }
    }
  }
  const n = used.length;
  let current = new Float32Array(count * n);
  for (let v = 0; v < count; v++) for (let k = 0; k < n; k++) current[v * n + k] = weights[v * boneCount + used[k]];
  let active = new Uint8Array(count);
  for (let v = 0; v < count; v++) {
    for (let i = degree[v]; i < degree[v + 1] && !active[v]; i++) {
      const u = neighbours[i];
      for (let k = 0; k < n; k++) {
        if (Math.abs(current[v * n + k] - current[u * n + k]) > 1e-3) {
          active[v] = 1;
          break;
        }
      }
    }
  }
  let next = current.slice();
  for (let iteration = 0; iteration < iterations; iteration++) {
    const grow = active.slice();
    for (let v = 0; v < count; v++) {
      if (!active[v]) continue;
      const start = degree[v];
      const end = degree[v + 1];
      const share = 0.5 / (end - start);
      for (let k = 0; k < n; k++) {
        let sum = 0;
        for (let i = start; i < end; i++) sum += current[neighbours[i] * n + k];
        next[v * n + k] = current[v * n + k] * 0.5 + sum * share;
      }
      for (let i = start; i < end; i++) grow[neighbours[i]] = 1;
    }
    [current, next] = [next, current];
    next.set(current);
    active = grow;
  }
  const skinIndex = new Uint16Array(count * 4);
  const skinWeight = new Float32Array(count * 4);
  const top = new Int32Array(4);
  for (let v = 0; v < count; v++) {
    // the four strongest bones
    top.fill(-1);
    for (let k = 0; k < n; k++) {
      const w = current[v * n + k];
      if (w <= 0) continue;
      let slot = 4;
      while (slot > 0 && (top[slot - 1] < 0 || current[v * n + top[slot - 1]] < w)) slot--;
      if (slot === 4) continue;
      top.copyWithin(slot + 1, slot, 3);
      top[slot] = k;
    }
    let total = 0;
    for (let slot = 0; slot < 4; slot++) if (top[slot] >= 0) total += current[v * n + top[slot]];
    for (let slot = 0; slot < 4; slot++) {
      if (top[slot] < 0) continue;
      skinIndex[v * 4 + slot] = used[top[slot]];
      skinWeight[v * 4 + slot] = current[v * n + top[slot]] / total;
    }
  }
  return { skinIndex, skinWeight };
}

// Where a line from `from` toward `to` first meets the surface, and the
// surface normal there (for laying decals on a model)
export function surfacePoint(field, from, to, steps = 200) {
  const at = (t) => from.map((value, i) => value + (to[i] - value) * t);
  let previous = 0;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    if (field(...at(t)) < 0) {
      let [low, high] = [previous, t];
      for (let k = 0; k < 24; k++) {
        const middle = (low + high) / 2;
        if (field(...at(middle)) < 0) high = middle;
        else low = middle;
      }
      const point = at(high);
      const e = 1e-4;
      const [x, y, z] = point;
      const normal = [field(x + e, y, z) - field(x - e, y, z), field(x, y + e, z) - field(x, y - e, z), field(x, y, z + e) - field(x, y, z - e)];
      const length = Math.hypot(...normal) || 1;
      return { point, normal: normal.map((n) => n / length) };
    }
    previous = t;
  }
  return null;
}
