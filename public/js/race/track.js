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
// In the infield facing the grandstand, placed to sit in the photo-finish shot beside the winning post
const BILLBOARD = { x: 26, z: -11, width: 18, height: 4.5, lift: 0.8 };

const HORIZON = 0xd4ebf4;
const SUN_OFFSET = new THREE.Vector3(-60, 120, 80); // where the sun sits relative to the action

// Energy Matrix colours
const SLATE = 0x415a7e;
const CORAL = 0xe47454;

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

// quality: { shadows: map size in pixels (0 = off), grass, flowers } (blade and flower counts)
export function buildVenue(scene, quality) {
  const random = seededRandom(20251104);

  const sky = addSky(scene);
  scene.fog = new THREE.Fog(HORIZON, 180, 1100);

  scene.add(new THREE.HemisphereLight(0xd8ecff, 0x7aa35a, 1.5));
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.6);
  sun.shadow.camera.left = -34;
  sun.shadow.camera.right = 34;
  sun.shadow.camera.top = 34;
  sun.shadow.camera.bottom = -34;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 320;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  addGround(scene);
  addTrack(scene);
  addRails(scene);
  addWinningPost(scene);
  addLake(scene);
  addTrees(scene, random);
  addSignage(scene);
  addHillsAndClouds(scene, random);
  const meadow = addGrassAndFlowers(scene, random);
  const crowd = addGrandstand(scene, random);

  function setQuality({ shadows, grass, flowers }) {
    sun.castShadow = shadows > 0;
    if (shadows > 0 && sun.shadow.mapSize.x !== shadows) {
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
      sun.shadow.mapSize.set(shadows, shadows);
    }
    meadow.setCounts(grass, flowers);
  }
  setQuality(quality);

  return {
    setQuality,
    // excitement 0..1 makes the crowd jump; focus is where the action is, so
    // the sun's shadows follow it; the sky stays centred on the camera
    update(time, excitement, focus, cameraPosition) {
      crowd.update(time, excitement);
      meadow.update(time);
      sun.position.set(focus.x + SUN_OFFSET.x, SUN_OFFSET.y, focus.z + SUN_OFFSET.z);
      sun.target.position.set(focus.x, 0, focus.z);
      sun.target.updateMatrixWorld();
      sky.position.copy(cameraPosition);
    },
  };
}

// A painted sky: deep blue overhead fading to a pale horizon, with a soft sun glow
function addSky(scene) {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x3b8bd6) },
      horizon: { value: new THREE.Color(HORIZON) },
      sun: { value: SUN_OFFSET.clone().normalize() },
    },
    vertexShader: `
      varying vec3 vDirection;
      void main() {
        vDirection = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position.z = gl_Position.w; // always behind everything
      }`,
    fragmentShader: `
      uniform vec3 top;
      uniform vec3 horizon;
      uniform vec3 sun;
      varying vec3 vDirection;
      void main() {
        vec3 direction = normalize(vDirection);
        vec3 colour = mix(horizon, top, pow(max(direction.y, 0.0), 0.5));
        float glow = max(dot(direction, sun), 0.0);
        colour += vec3(1.0, 0.9, 0.7) * (pow(glow, 48.0) * 0.9 + pow(glow, 5.0) * 0.15);
        gl_FragColor = vec4(colour, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  material.userData.outlineParameters = { visible: false };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1300, 32, 16), material);
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  scene.add(sky);
  return sky;
}

// Meadow grass with soft painterly patches
function addGround(scene) {
  const texture = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#69b24f';
    ctx.fillRect(0, 0, w, h);
    const random = seededRandom(7);
    for (let i = 0; i < 260; i++) {
      const x = random() * w;
      const y = random() * h;
      const r = 6 + random() * 22;
      const blob = ctx.createRadialGradient(x, y, 0, x, y, r);
      const tone = random() < 0.5 ? '120, 196, 92' : '86, 158, 66';
      blob.addColorStop(0, `rgba(${tone}, 0.55)`);
      blob.addColorStop(1, `rgba(${tone}, 0)`);
      ctx.fillStyle = blob;
      // Draw wrapped so the texture tiles seamlessly
      for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) ctx.fillRect(x - r + dx, y - r + dy, r * 2, r * 2);
    }
  });
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(110, 110);
  texture.anisotropy = 8;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), toon(0xffffff, { map: texture, outline: false, rim: false }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
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
  // Mown turf: two-tone stripes across the track, flecked, with a worn line along the rail
  const turfTexture = canvasTexture(512, 128, (ctx, w, h) => {
    ctx.fillStyle = '#93d16b';
    ctx.fillRect(0, 0, w / 2, h);
    ctx.fillStyle = '#84c45e';
    ctx.fillRect(w / 2, 0, w / 2, h);
    const random = seededRandom(11);
    for (let i = 0; i < 5000; i++) {
      ctx.fillStyle = random() < 0.5 ? 'rgba(255, 255, 220, 0.08)' : 'rgba(40, 90, 30, 0.08)';
      ctx.fillRect(random() * w, random() * h, 1 + random() * 2, 1 + random());
    }
    const worn = ctx.createLinearGradient(0, 0, 0, h);
    worn.addColorStop(0.02, 'rgba(150, 130, 80, 0)');
    worn.addColorStop(0.1, 'rgba(150, 130, 80, 0.18)');
    worn.addColorStop(0.24, 'rgba(150, 130, 80, 0)');
    ctx.fillStyle = worn;
    ctx.fillRect(0, 0, w, h);
  });
  turfTexture.wrapS = THREE.RepeatWrapping;
  turfTexture.anisotropy = 8;

  const turf = new THREE.Mesh(ribbon(-0.8, TRACK_WIDTH + 0.8, 16), toon(0xffffff, { map: turfTexture, outline: false, rim: false }));
  turf.position.y = 0.02;
  turf.receiveShadow = true;
  scene.add(turf);

  const finishLine = new THREE.Mesh(new THREE.PlaneGeometry(0.5, TRACK_WIDTH + 1.6), toon(0xffffff, { outline: false, rim: false }));
  const p = trackPoint(0, TRACK_WIDTH / 2);
  finishLine.rotation.x = -Math.PI / 2;
  finishLine.position.set(p.x, 0.04, p.z);
  finishLine.receiveShadow = true;
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
    rail.castShadow = true;
    scene.add(rail);
    for (let i = 0; i < perRail; i++) {
      trackPoint(i * spacing, offset, p);
      dummy.position.set(p.x, 0, p.z);
      dummy.updateMatrix();
      posts.setMatrixAt(railIndex * perRail + i, dummy.matrix);
    }
  });
  posts.castShadow = true;
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
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.12, 24), toon(CORAL));
  disc.rotation.x = Math.PI / 2;
  disc.position.y = 4.9;
  const centre = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.14, 24), toon(0xffffff));
  centre.rotation.x = Math.PI / 2;
  centre.position.y = 4.9;
  post.add(pole, disc, centre);
  for (const part of post.children) part.castShadow = true;
  scene.add(post);
}

function addLake(scene) {
  const flat = (color, sx, sz, y) => {
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(1, 48), toon(color, { outline: false, rim: false }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.scale.set(sx, sz, 1);
    mesh.position.y = y;
    mesh.receiveShadow = true;
    scene.add(mesh);
  };
  flat(0xe9dcae, 18.5, 8.6, 0.03);
  flat(0x4fb6e0, 17, 7.4, 0.05);
  flat(0x8fd8f2, 11, 3.6, 0.06);
  flat(0xd4f2fb, 4, 0.9, 0.07);
}

// Where things can go: the infield, the outside of the track (not the
// grandstand), clear of the lake and the billboard
function siteOf(x, z) {
  const distance = Math.hypot(x - Math.max(-STRAIGHT / 2, Math.min(STRAIGHT / 2, x)), z);
  if ((x / 19.5) ** 2 + (z / 9.5) ** 2 < 1) return 'lake';
  if (Math.abs(x - BILLBOARD.x) < BILLBOARD.width / 2 + 1 && Math.abs(z - BILLBOARD.z) < 1.5) return 'billboard';
  if (distance < RADIUS - 1.2) return 'infield';
  if (distance < RADIUS + TRACK_WIDTH + 1.2) return 'track';
  if (z > RADIUS + TRACK_WIDTH && z < GRANDSTAND_FRONT + 14 && x > -34 && x < 42) return 'stand';
  return 'outside';
}

// Lush, rounded trees and layered pines, with no ink outlines, as in a painted landscape
function addTrees(scene, random) {
  const spots = [];
  const blocksBillboard = (x) => Math.abs(x - BILLBOARD.x) < BILLBOARD.width / 2 + 4;
  while (spots.length < 30) {
    const x = (random() * 2 - 1) * (STRAIGHT / 2 + RADIUS - 8);
    const z = (random() * 2 - 1) * (RADIUS - 13);
    if (siteOf(x, z) === 'infield' && (x / 22) ** 2 + (z / 11) ** 2 > 1 && !blocksBillboard(x)) spots.push([x, z]);
  }
  while (spots.length < 150) {
    const angle = random() * Math.PI * 2;
    const distance = 95 + random() * 130;
    const x = Math.cos(angle) * distance * 1.25;
    const z = Math.sin(angle) * distance;
    if (siteOf(x, z) === 'outside' && Math.hypot(x, z) > 90) spots.push([x, z]);
  }

  const canopy = mergeGeometries([
    new THREE.IcosahedronGeometry(1.9, 2).translate(0, 3.6, 0),
    new THREE.IcosahedronGeometry(1.4, 2).translate(1.1, 3.1, 0.4),
    new THREE.IcosahedronGeometry(1.3, 2).translate(-1.0, 3.0, -0.5),
    new THREE.IcosahedronGeometry(1.2, 2).translate(0.2, 4.6, -0.3),
  ]);
  const pine = mergeGeometries([
    new THREE.ConeGeometry(1.9, 2.6, 9).translate(0, 2.4, 0),
    new THREE.ConeGeometry(1.5, 2.3, 9).translate(0, 3.6, 0),
    new THREE.ConeGeometry(1.05, 2.0, 9).translate(0, 4.7, 0),
  ]);
  const roundCount = Math.ceil(spots.length * 0.6);
  const trunks = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.22, 0.34, 2.4, 7).translate(0, 1.2, 0),
    toon(0x7a5230, { name: 'trunks', outline: false }),
    spots.length,
  );
  const foliage = [
    new THREE.InstancedMesh(canopy, toon(0xffffff, { name: 'canopy', outline: false }), roundCount),
    new THREE.InstancedMesh(pine, toon(0xffffff, { name: 'pines', outline: false }), spots.length - roundCount),
  ];
  const greens = [0x3f9c4a, 0x4fae52, 0x358a40, 0x63b955, 0x2f7d3d].map((c) => new THREE.Color(c));
  const dummy = new THREE.Object3D();

  spots.forEach(([x, z], i) => {
    dummy.position.set(x, 0, z);
    dummy.rotation.y = random() * Math.PI * 2;
    dummy.scale.setScalar(0.8 + random() * 0.8);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    const [mesh, index] = i < roundCount ? [foliage[0], i] : [foliage[1], i - roundCount];
    mesh.setMatrixAt(index, dummy.matrix);
    mesh.setColorAt(index, greens[Math.floor(random() * greens.length)]);
  });

  for (const mesh of [trunks, ...foliage]) {
    mesh.castShadow = true;
    scene.add(mesh);
  }
}

// Energy Matrix signage: boards on the inside rail of both straights facing out
// (so they sit behind the horses in TV shots from outside the track), and a
// billboard in the infield facing the grandstand
function addSignage(scene) {
  const logo = new THREE.MeshBasicMaterial({ map: logoTexture() });
  const name = new THREE.MeshBasicMaterial({ map: textTexture('MELBOURNE CUP', SLATE, CORAL) });
  const board = new THREE.BoxGeometry(5.6, 1.4, 0.15);
  const p = {};
  const straights = [
    [-HOME_STRAIGHT_RUN, STRAIGHT - HOME_STRAIGHT_RUN],
    [STRAIGHT + BEND - HOME_STRAIGHT_RUN, 2 * STRAIGHT + BEND - HOME_STRAIGHT_RUN],
  ];
  let count = 0;
  for (const [from, to] of straights) {
    for (let s = from + 4; s <= to - 4; s += 7) {
      if (Math.abs(s) < 9) continue; // keep the photo-finish shot clear
      trackPoint(s, -1.6, p);
      const sign = new THREE.Mesh(board, count++ % 2 ? name : logo);
      sign.position.set(p.x, 0.85, p.z);
      sign.rotation.y = Math.atan2(-p.dz, p.dx); // front face points out across the track
      scene.add(sign);
    }
  }

  const billboard = new THREE.Group();
  billboard.position.set(BILLBOARD.x, 0, BILLBOARD.z);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(BILLBOARD.width, BILLBOARD.height, 0.3), logo);
  panel.position.y = BILLBOARD.lift + BILLBOARD.height / 2;
  billboard.add(panel);
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, BILLBOARD.lift + 0.2, 8), toon(SLATE));
    leg.position.set(side * BILLBOARD.width * 0.35, (BILLBOARD.lift + 0.2) / 2, 0);
    billboard.add(leg);
  }
  scene.add(billboard);
}

// The Energy Matrix logo on a white board
function logoTexture() {
  const texture = canvasTexture(1024, 256, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
  });
  const image = new Image();
  image.onload = () => {
    const height = 196;
    const width = (height * image.naturalWidth) / image.naturalHeight;
    texture.image.getContext('2d').drawImage(image, (1024 - width) / 2, 30, width, height);
    texture.needsUpdate = true;
  };
  image.src = '/img/emg-logo.svg';
  return texture;
}

// White Montserrat text on a coloured board with an accent stripe. Drawn
// straight away, then redrawn once the brand font has loaded.
function textTexture(text, background, stripe, { width = 1024, height = 256, size = 92, repeat = 1 } = {}) {
  const draw = (ctx) => {
    ctx.fillStyle = `#${background.toString(16).padStart(6, '0')}`;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = `#${stripe.toString(16).padStart(6, '0')}`;
    ctx.fillRect(0, height - height / 10, width, height / 10);
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${size}px Montserrat, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, width / 2, height * 0.45);
  };
  const texture = canvasTexture(width, height, draw);
  texture.wrapS = THREE.RepeatWrapping;
  texture.repeat.x = repeat;
  document.fonts?.load(`800 ${size}px Montserrat`).then(() => {
    draw(texture.image.getContext('2d'));
    texture.needsUpdate = true;
  }, () => {});
  return texture;
}

// Rolling green hills, hazy blue mountains with snow caps far away, and soft clouds
// A craggy peak: a cone with its slopes pushed in and out, snow on the upper part
function mountain(random, height, x, z) {
  const radius = height * (1.3 + random() * 0.5);
  const geometry = new THREE.ConeGeometry(radius, height, 11, 5, true).toNonIndexed();
  const position = geometry.attributes.position;
  const colors = [];
  const rock = new THREE.Color(0x5f7f9c);
  const snow = new THREE.Color(0xf2f6fa);
  const jitter = new Map(); // shared vertices move together, so the surface stays closed
  for (let i = 0; i < position.count; i++) {
    const key = `${position.getX(i).toFixed(2)},${position.getY(i).toFixed(2)},${position.getZ(i).toFixed(2)}`;
    if (!jitter.has(key)) jitter.set(key, [1 + (random() - 0.5) * 0.35, (random() - 0.5) * height * 0.08]);
    const [spread, lift] = jitter.get(key);
    const up = (position.getY(i) + height / 2) / height; // 0 at the base, 1 at the top
    position.setXYZ(i, position.getX(i) * (up < 0.99 ? spread : 1), position.getY(i) + (up > 0.02 && up < 0.99 ? lift : 0), position.getZ(i) * (up < 0.99 ? spread : 1));
    const colour = up > 0.68 + Math.sin(i * 12.9898) * 0.06 ? snow : rock.clone().offsetHSL(0, 0, (Math.sin(i * 78.233) * 0.5) * 0.06);
    colors.push(colour.r, colour.g, colour.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry.translate(x, height / 2 - 8, z);
}

function addHillsAndClouds(scene, random) {
  const hills = [[], []];
  for (let i = 0; i < 16; i++) {
    const angle = (i / 16) * Math.PI * 2 + random() * 0.3;
    const size = 70 + random() * 70;
    hills[i % 2].push(
      new THREE.SphereGeometry(1, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2)
        .scale(size, size * (0.2 + random() * 0.18), size)
        .translate(Math.cos(angle) * 400, -2, Math.sin(angle) * 340),
    );
  }
  scene.add(
    new THREE.Mesh(mergeGeometries(hills[0]), toon(0x6fae55, { outline: false, rim: false })),
    new THREE.Mesh(mergeGeometries(hills[1]), toon(0x80bb5f, { outline: false, rim: false })),
  );

  const peaks = [];
  for (let i = 0; i < 26; i++) {
    const angle = (i / 26) * Math.PI * 2 + random() * 0.2;
    const distance = 820 + random() * 160;
    peaks.push(mountain(random, 70 + random() * 110, Math.cos(angle) * distance, Math.sin(angle) * distance));
  }
  scene.add(new THREE.Mesh(mergeGeometries(peaks), toon(0xffffff, { vertexColors: true, outline: false, rim: false, name: 'mountains' })));

  const puffs = [];
  for (let i = 0; i < 16; i++) {
    const angle = random() * Math.PI * 2;
    const x = Math.cos(angle) * (200 + random() * 220);
    const y = 80 + random() * 50;
    const z = Math.sin(angle) * (180 + random() * 200);
    for (let j = 0; j < 7; j++) {
      const size = 6 + random() * 9;
      puffs.push(
        new THREE.IcosahedronGeometry(1, 2)
          .scale(size * 1.4, size * 0.75, size)
          .translate(x + (j - 3) * 8 + random() * 4, y + random() * 4, z + random() * 6),
      );
    }
  }
  scene.add(new THREE.Mesh(mergeGeometries(puffs), toon(0xffffff, { outline: false, name: 'clouds' })));
}

// Grass blades and wildflowers that sway in the breeze, in the infield and
// around the outside of the track. Counts change with the quality setting.
function addGrassAndFlowers(scene, random) {
  const wind = { value: 0 };
  // Bend each blade in world space, more at the tip than the root
  const sway = (shader) => {
    shader.uniforms.uTime = wind;
    shader.vertexShader = `uniform float uTime;\nattribute float sway;\n${shader.vertexShader}`.replace(
      '#include <project_vertex>',
      `vec4 mvPosition = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        mvPosition = instanceMatrix * mvPosition;
      #endif
      float gust = sin(uTime * 1.6 + mvPosition.x * 0.12 + mvPosition.z * 0.09) * 0.6
        + sin(uTime * 3.7 + mvPosition.x * 0.5 + mvPosition.z * 0.3) * 0.25;
      mvPosition.xz += vec2(0.13, 0.06) * gust * sway * sway;
      mvPosition = modelViewMatrix * mvPosition;
      gl_Position = projectionMatrix * mvPosition;`,
    );
  };

  // A blade: three triangles, darker at the root, normals up so it's lit like the ground
  const blade = new THREE.BufferGeometry();
  blade.setAttribute('position', new THREE.Float32BufferAttribute([-0.07, 0, 0, 0.07, 0, 0, -0.045, 0.2, 0, 0.045, 0.2, 0, 0, 0.42, 0], 3));
  blade.setAttribute('normal', new THREE.Float32BufferAttribute(Array.from({ length: 5 }, () => [0, 1, 0]).flat(), 3));
  blade.setAttribute('color', new THREE.Float32BufferAttribute([0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 0.88, 0.88, 0.88, 0.88, 0.88, 0.88, 1.08, 1.08, 1.0], 3));
  blade.setAttribute('sway', new THREE.Float32BufferAttribute([0, 0, 0.48, 0.48, 1], 1));
  blade.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4]);

  // A flower: two crossed petals on a short stem
  const flower = mergeGeometries([
    new THREE.PlaneGeometry(0.16, 0.16).translate(0, 0.34, 0),
    new THREE.PlaneGeometry(0.16, 0.16).rotateY(Math.PI / 2).translate(0, 0.34, 0),
  ]);
  flower.setAttribute('sway', new THREE.Float32BufferAttribute(Array(flower.attributes.position.count).fill(0.8), 1));

  const grassMaterial = toon(0xffffff, { vertexColors: true, outline: false, rim: false, side: THREE.DoubleSide, name: 'grass' });
  const flowerMaterial = toon(0xffffff, { outline: false, rim: false, side: THREE.DoubleSide, name: 'flowers' });
  for (const material of [grassMaterial, flowerMaterial]) {
    material.onBeforeCompile = sway;
    material.customProgramCacheKey = () => 'sway';
  }

  const MAX_GRASS = 50000;
  const MAX_FLOWERS = 1800;
  const grass = new THREE.InstancedMesh(blade, grassMaterial, MAX_GRASS);
  const flowers = new THREE.InstancedMesh(flower, flowerMaterial, MAX_FLOWERS);
  const greens = [0x82c853, 0x93d35e, 0x76c04d, 0xa2da6a, 0x6db84a].map((c) => new THREE.Color(c));
  const petals = [0xffffff, 0xfff1a8, 0xf6b6c8, 0xbcd8ff, 0xffd27a].map((c) => new THREE.Color(c));
  const dummy = new THREE.Object3D();

  // Scatter in random order, so lowering the count thins the meadow evenly
  function scatter(mesh, count, colours, sizes) {
    let placed = 0;
    while (placed < count) {
      const x = (random() * 2 - 1) * 110;
      const z = (random() * 2 - 1) * 90;
      const site = siteOf(x, z);
      if (site !== 'infield' && site !== 'outside') continue;
      dummy.position.set(x, 0.02, z);
      dummy.rotation.y = random() * Math.PI;
      dummy.scale.setScalar(sizes[0] + random() * (sizes[1] - sizes[0]));
      dummy.updateMatrix();
      mesh.setMatrixAt(placed, dummy.matrix);
      mesh.setColorAt(placed, colours[Math.floor(random() * colours.length)]);
      placed++;
    }
  }
  scatter(grass, MAX_GRASS, greens, [0.8, 1.7]);
  scatter(flowers, MAX_FLOWERS, petals, [0.8, 1.3]);
  grass.receiveShadow = true;
  grass.frustumCulled = false;
  flowers.frustumCulled = false;
  scene.add(grass, flowers);

  return {
    setCounts(grassCount, flowerCount) {
      grass.count = Math.min(MAX_GRASS, grassCount);
      flowers.count = Math.min(MAX_FLOWERS, flowerCount);
      grass.visible = grass.count > 0;
      flowers.visible = flowers.count > 0;
    },
    update(time) {
      wind.value = time;
    },
  };
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
    const tier = new THREE.Mesh(new THREE.BoxGeometry(length, height, tierDepth), toon(i % 2 ? 0xedf2f7 : 0xf7fafc));
    tier.position.set(centreX, height / 2, GRANDSTAND_FRONT + tierDepth * (i + 0.5));
    stand.add(tier);
  }

  const back = GRANDSTAND_FRONT + tiers * tierDepth;
  const wall = new THREE.Mesh(new THREE.BoxGeometry(length, 11, 0.6), toon(0xf7fafc));
  wall.position.set(centreX, 5.5, back + 0.3);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(length + 2, 0.5, tiers * tierDepth + 3), toon(SLATE));
  roof.position.set(centreX, 11.2, back - (tiers * tierDepth) / 2 - 1);
  roof.rotation.x = -0.06;
  // Coral fascia carrying the company name along the front of the roof
  const fasciaText = textTexture('ENERGY MATRIX GROUP  •  MELBOURNE CUP  •', CORAL, SLATE, { width: 2048, height: 96, size: 54, repeat: 3 });
  const fascia = new THREE.Mesh(new THREE.BoxGeometry(length + 2, 1.1, 0.25), new THREE.MeshBasicMaterial({ map: fasciaText }));
  fascia.position.set(centreX, 10.7, GRANDSTAND_FRONT - 2.4);
  stand.add(wall, roof, fascia);

  for (let x = -length / 2; x <= length / 2; x += 16) {
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 10.6, 8), toon(0xffffff));
    pillar.position.set(centreX + x, 5.3, GRANDSTAND_FRONT - 2.2);
    stand.add(pillar);
  }
  stand.traverse((part) => {
    part.castShadow = true;
    part.receiveShadow = true;
  });
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
  const shirts = [CORAL, SLATE, 0x9dc0d7, 0x2b3340, 0xccebf7, 0xffffff, 0xf5a524, 0x13612e, 0x1159af, 0xf7630c].map((c) => new THREE.Color(c));
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
