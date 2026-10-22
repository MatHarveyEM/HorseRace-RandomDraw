// The racecourse: an oval of two straights joined by semicircular bends, plus
// the scenery around it (rails, winning post, grandstand and crowd, trees).
//
// Positions on the track are given as (s, offset):
//   s      distance travelled along the inside rail, measured from the finish line
//   offset distance out from the inside rail towards the outside rail
// Horses race anticlockwise (seen from above).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { addInstancedOutline, canvasTexture, toon } from './toon.js';

export const STRAIGHT = 60;
export const RADIUS = 28; // inside rail radius on the bends
export const TRACK_WIDTH = 16;
export const LAP_LENGTH = 2 * STRAIGHT + 2 * Math.PI * RADIUS;
export const HOME_STRAIGHT_RUN = STRAIGHT * 0.8; // from the home turn to the finish line

const BEND = Math.PI * RADIUS;
const GRANDSTAND_FRONT = RADIUS + TRACK_WIDTH + 14;

// World position and direction of travel at a point on the track
export function trackPoint(s, offset, out = { x: 0, z: 0, dx: 1, dz: 0 }) {
  let u = (((s + HOME_STRAIGHT_RUN) % LAP_LENGTH) + LAP_LENGTH) % LAP_LENGTH;
  const r = RADIUS + offset;

  if (u < STRAIGHT) return set(out, -STRAIGHT / 2 + u, r, 1, 0); // home straight
  u -= STRAIGHT;
  if (u < BEND) return onBend(out, STRAIGHT / 2, Math.PI / 2 - u / RADIUS, r);
  u -= BEND;
  if (u < STRAIGHT) return set(out, STRAIGHT / 2 - u, -r, -1, 0); // back straight
  u -= STRAIGHT;
  return onBend(out, -STRAIGHT / 2, -Math.PI / 2 - u / RADIUS, r);
}

export function isOnStraight(s) {
  const u = (((s + HOME_STRAIGHT_RUN) % LAP_LENGTH) + LAP_LENGTH) % LAP_LENGTH;
  return u < STRAIGHT || (u >= STRAIGHT + BEND && u < 2 * STRAIGHT + BEND);
}

function set(out, x, z, dx, dz) {
  out.x = x;
  out.z = z;
  out.dx = dx;
  out.dz = dz;
  return out;
}

function onBend(out, centreX, angle, r) {
  return set(out, centreX + r * Math.cos(angle), r * Math.sin(angle), Math.sin(angle), -Math.cos(angle));
}

class TrackCurve extends THREE.Curve {
  constructor(offset, y) {
    super();
    this.offset = offset;
    this.y = y;
  }

  getPoint(t, target = new THREE.Vector3()) {
    const p = trackPoint(t * LAP_LENGTH, this.offset);
    return target.set(p.x, this.y, p.z);
  }
}

// Same layout every time the page loads
function seededRandom(seed) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

export function buildVenue(scene) {
  const random = seededRandom(20251104);

  scene.background = canvasTexture(2, 256, (ctx, w, h) => {
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#4fa9e8');
    sky.addColorStop(0.65, '#bfe6fa');
    sky.addColorStop(1, '#e4f6fd');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
  });
  scene.fog = new THREE.Fog(0xd3effb, 260, 650);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x8fbf6a, 1.4));
  const sun = new THREE.DirectionalLight(0xfff4e0, 2.4);
  sun.position.set(-60, 120, 80);
  scene.add(sun);

  addGround(scene);
  addTrack(scene);
  addRails(scene);
  addWinningPost(scene);
  addLake(scene);
  addTrees(scene, random);
  addHillsAndClouds(scene, random);
  const crowd = addGrandstand(scene, random);

  return {
    // excitement 0..1 makes the crowd jump
    update(time, excitement) {
      crowd.update(time, excitement);
    },
  };
}

function addGround(scene) {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), toon(0x5aa548, { outline: false }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
}

function ribbon(inner, outer, uScale) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const samples = Math.ceil(LAP_LENGTH);
  const p = {};
  for (let i = 0; i <= samples; i++) {
    const s = (i / samples) * LAP_LENGTH;
    for (const [offset, v] of [[inner, 0], [outer, 1]]) {
      trackPoint(s, offset, p);
      positions.push(p.x, 0, p.z);
      uvs.push(s / uScale, v);
    }
    if (i < samples) indices.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function addTrack(scene) {
  // Turf with mowing stripes across the track
  const stripes = canvasTexture(2, 1, (ctx) => {
    ctx.fillStyle = '#93d46c';
    ctx.fillRect(0, 0, 1, 1);
    ctx.fillStyle = '#82c65d';
    ctx.fillRect(1, 0, 1, 1);
  });
  stripes.wrapS = THREE.RepeatWrapping;
  stripes.magFilter = THREE.NearestFilter;
  stripes.minFilter = THREE.NearestFilter;

  const turf = new THREE.Mesh(ribbon(-0.8, TRACK_WIDTH + 0.8, 16), toon(0xffffff, { map: stripes, outline: false }));
  turf.position.y = 0.02;
  scene.add(turf);

  const finishLine = new THREE.Mesh(new THREE.PlaneGeometry(0.5, TRACK_WIDTH + 1.6), toon(0xffffff, { outline: false }));
  const p = trackPoint(0, TRACK_WIDTH / 2);
  finishLine.rotation.x = -Math.PI / 2;
  finishLine.position.set(p.x, 0.04, p.z);
  scene.add(finishLine);
}

function addRails(scene) {
  const white = toon(0xffffff);
  const postGeometry = new THREE.CylinderGeometry(0.07, 0.07, 1, 5).translate(0, 0.5, 0);
  const spacing = 3;
  const perRail = Math.floor(LAP_LENGTH / spacing);
  const posts = new THREE.InstancedMesh(postGeometry, toon(0xffffff, { name: 'posts' }), perRail * 2);
  const dummy = new THREE.Object3D();
  const p = {};

  [-0.5, TRACK_WIDTH + 0.5].forEach((offset, railIndex) => {
    const rail = new THREE.Mesh(new THREE.TubeGeometry(new TrackCurve(offset, 1), 420, 0.1, 6, true), white);
    scene.add(rail);
    for (let i = 0; i < perRail; i++) {
      trackPoint(i * spacing, offset, p);
      dummy.position.set(p.x, 0, p.z);
      dummy.updateMatrix();
      posts.setMatrixAt(railIndex * perRail + i, dummy.matrix);
    }
  });
  scene.add(posts);
  addInstancedOutline(posts, 0.035);
}

function addWinningPost(scene) {
  // On the inside rail, so it sits behind the horses in the photo-finish shot
  const p = trackPoint(0, -1.4);
  const post = new THREE.Group();
  post.position.set(p.x, 0, p.z);

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 4.6, 8), toon(0xffffff));
  pole.position.y = 2.3;
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.12, 24), toon(0xd7263d));
  disc.rotation.x = Math.PI / 2;
  disc.position.y = 4.9;
  const centre = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.14, 24), toon(0xffffff));
  centre.rotation.x = Math.PI / 2;
  centre.position.y = 4.9;
  post.add(pole, disc, centre);
  scene.add(post);
}

function addLake(scene) {
  const flat = (color, sx, sz, y) => {
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(1, 48), toon(color, { outline: false }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.scale.set(sx, sz, 1);
    mesh.position.y = y;
    scene.add(mesh);
  };
  flat(0xe9dcae, 18.5, 8.6, 0.03);
  flat(0x58bfe6, 17, 7.4, 0.05);
  flat(0x8fd8f2, 9, 3, 0.06);
}

function addTrees(scene, random) {
  const spots = [];
  const inInfield = (x, z) => Math.abs(z) < RADIUS - 13 && Math.abs(x) < STRAIGHT / 2 + RADIUS - 8;
  const nearLake = (x, z) => (x / 22) ** 2 + (z / 11) ** 2 < 1;
  const onTrackOrStand = (x, z) => {
    const nearestCentreX = Math.max(-STRAIGHT / 2, Math.min(STRAIGHT / 2, x));
    const distance = Math.hypot(x - nearestCentreX, z);
    if (distance > RADIUS - 6 && distance < RADIUS + TRACK_WIDTH + 8) return true;
    return z > RADIUS + TRACK_WIDTH && z < GRANDSTAND_FRONT + 16 && x > -36 && x < 44;
  };

  while (spots.length < 34) {
    const x = (random() * 2 - 1) * (STRAIGHT / 2 + RADIUS - 8);
    const z = (random() * 2 - 1) * (RADIUS - 13);
    if (inInfield(x, z) && !nearLake(x, z) && !onTrackOrStand(x, z)) spots.push([x, z]);
  }
  while (spots.length < 130) {
    const angle = random() * Math.PI * 2;
    const distance = 95 + random() * 110;
    const x = Math.cos(angle) * distance * 1.25;
    const z = Math.sin(angle) * distance;
    if (!onTrackOrStand(x, z)) spots.push([x, z]);
  }

  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.28, 0.36, 1.8, 6).translate(0, 0.9, 0), toon(0x7a5230, { name: 'trunks' }), spots.length);
  const pines = new THREE.ConeGeometry(1.7, 4.2, 7).translate(0, 3.6, 0);
  const rounds = new THREE.IcosahedronGeometry(1.9, 1).translate(0, 3.3, 0);
  const pineCount = Math.ceil(spots.length / 2);
  const foliage = [
    new THREE.InstancedMesh(pines, toon(0xffffff, { name: 'foliage' }), pineCount),
    new THREE.InstancedMesh(rounds, toon(0xffffff, { name: 'foliage' }), spots.length - pineCount),
  ];
  const greens = [0x2f8f46, 0x3d9e4f, 0x267a3c, 0x4caf50].map((c) => new THREE.Color(c));
  const dummy = new THREE.Object3D();

  spots.forEach(([x, z], i) => {
    const size = 0.8 + random() * 0.7;
    dummy.position.set(x, 0, z);
    dummy.rotation.y = random() * Math.PI;
    dummy.scale.setScalar(size);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    const [mesh, index] = i < pineCount ? [foliage[0], i] : [foliage[1], i - pineCount];
    mesh.setMatrixAt(index, dummy.matrix);
    mesh.setColorAt(index, greens[Math.floor(random() * greens.length)]);
  });

  for (const mesh of [trunks, ...foliage]) {
    scene.add(mesh);
    addInstancedOutline(mesh, 0.06);
  }
}

function addHillsAndClouds(scene, random) {
  const hills = [[], []];
  for (let i = 0; i < 14; i++) {
    const angle = (i / 14) * Math.PI * 2 + random() * 0.3;
    const size = 70 + random() * 60;
    hills[i % 2].push(
      new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2)
        .scale(size, size * (0.22 + random() * 0.18), size)
        .translate(Math.cos(angle) * 420, -2, Math.sin(angle) * 360),
    );
  }
  scene.add(new THREE.Mesh(mergeGeometries(hills[0]), toon(0x6aa456)), new THREE.Mesh(mergeGeometries(hills[1]), toon(0x79b25f)));

  // Flat white puffs with an ink outline
  const puffs = [];
  for (let i = 0; i < 12; i++) {
    const angle = random() * Math.PI * 2;
    const x = Math.cos(angle) * (180 + random() * 140);
    const y = 70 + random() * 35;
    const z = Math.sin(angle) * (160 + random() * 120);
    for (let j = 0; j < 5; j++) {
      const size = 5 + random() * 6;
      puffs.push(
        new THREE.SphereGeometry(1, 14, 10)
          .scale(size * 1.3, size * 0.8, size)
          .translate(x + j * 6 - 12 + random() * 3, y + random() * 3, z + random() * 4),
      );
    }
  }
  scene.add(new THREE.Mesh(mergeGeometries(puffs), new THREE.MeshBasicMaterial({ color: 0xffffff })));
}

function addGrandstand(scene, random) {
  const length = 64;
  const centreX = 4;
  const tiers = 6;
  const tierDepth = 1.5;
  const tierRise = 0.95;
  const stand = new THREE.Group();

  for (let i = 0; i < tiers; i++) {
    const height = 0.8 + (i + 1) * tierRise;
    const tier = new THREE.Mesh(new THREE.BoxGeometry(length, height, tierDepth), toon(i % 2 ? 0xe9e0c8 : 0xf6efdc));
    tier.position.set(centreX, height / 2, GRANDSTAND_FRONT + tierDepth * (i + 0.5));
    stand.add(tier);
  }

  const back = GRANDSTAND_FRONT + tiers * tierDepth;
  const wall = new THREE.Mesh(new THREE.BoxGeometry(length, 11, 0.6), toon(0xf6efdc));
  wall.position.set(centreX, 5.5, back + 0.3);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(length + 2, 0.5, tiers * tierDepth + 3), toon(0x1d4d34));
  roof.position.set(centreX, 11.2, back - (tiers * tierDepth) / 2 - 1);
  roof.rotation.x = -0.06;
  const fascia = new THREE.Mesh(new THREE.BoxGeometry(length + 2, 0.7, 0.25), toon(0xd4af37));
  fascia.position.set(centreX, 10.7, GRANDSTAND_FRONT - 2.4);
  stand.add(wall, roof, fascia);

  for (let x = -length / 2; x <= length / 2; x += 16) {
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 10.6, 8), toon(0xffffff));
    pillar.position.set(centreX + x, 5.3, GRANDSTAND_FRONT - 2.2);
    stand.add(pillar);
  }
  scene.add(stand);

  // The crowd, one capsule and head per person on each tier
  const people = [];
  for (let i = 0; i < tiers; i++) {
    const y = 0.8 + (i + 1) * tierRise;
    for (let x = -length / 2 + 0.6; x < length / 2 - 0.6; x += 0.8) {
      if (random() < 0.12) continue;
      people.push({ x: centreX + x + (random() - 0.5) * 0.3, y, z: GRANDSTAND_FRONT + tierDepth * (i + 0.5), phase: random() * Math.PI * 2, rate: 5 + random() * 4 });
    }
  }

  const bodies = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.22, 0.38, 2, 6), toon(0xffffff, { name: 'crowd' }), people.length);
  const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.17, 8, 6), toon(0xffffff, { name: 'crowd' }), people.length);
  const shirts = [0xd7263d, 0xf4a261, 0x2a9d8f, 0x264653, 0xe9c46a, 0x8338ec, 0x3a86ff, 0xffffff, 0xff006e, 0x06d6a0].map((c) => new THREE.Color(c));
  const skins = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac].map((c) => new THREE.Color(c));
  people.forEach((_, i) => {
    bodies.setColorAt(i, shirts[Math.floor(random() * shirts.length)]);
    heads.setColorAt(i, skins[Math.floor(random() * skins.length)]);
  });
  scene.add(bodies, heads);
  addInstancedOutline(bodies, 0.03);
  addInstancedOutline(heads, 0.03);

  const dummy = new THREE.Object3D();
  function update(time, excitement) {
    people.forEach((person, i) => {
      const jump = excitement * Math.max(0, Math.sin(time * person.rate + person.phase)) * 0.45;
      const sway = Math.sin(time * 1.3 + person.phase) * 0.03;
      dummy.position.set(person.x + sway, person.y + 0.45 + jump, person.z);
      dummy.updateMatrix();
      bodies.setMatrixAt(i, dummy.matrix);
      dummy.position.y += 0.55;
      dummy.updateMatrix();
      heads.setMatrixAt(i, dummy.matrix);
    });
    bodies.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
  }
  update(0, 0);
  return { update };
}
