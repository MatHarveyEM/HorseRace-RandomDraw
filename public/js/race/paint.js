// Paint for the horses and riders: what makes each one look different on the
// shared sculpted model (see horse.js).
//
// Broad colour (coat, points, mane, hooves, tack, the rider's kit) is painted
// per vertex. Anything with a crisp edge (pinto patches, socks, a blaze, and
// the hoops, stripes, sash or quarters of the racing silks) is drawn per pixel
// in the shader, so edges stay sharp and smooth however close the camera gets.
import * as THREE from 'three';
import { silksFor } from '../silks.js';
import { HEAD_ANGLE, PAINTS, POLL, RIDER } from './anatomy.js';
import { toon } from './toon.js';

const WHITE = 0xf6f4ee;
const COATS = [
  { coat: 0x8a5230, points: 0x231915, mane: 0x1c1411 }, // bay
  { coat: 0xb0602f, points: 0xa45a2b, mane: 0x8f4a22 }, // chestnut
  { coat: 0x2f2725, points: 0x221c1a, mane: 0x151110 }, // black
  { coat: 0xb9b5ad, points: 0x5d5853, mane: 0xe4e0d8, dapples: true }, // grey
  { coat: 0xd8a85c, points: 0xcf9f55, mane: 0xf3e6c8 }, // palomino
  { coat: 0xc99a5b, points: 0x231915, mane: 0x1c1411 }, // buckskin
  { coat: 0x5a3824, points: 0x231915, mane: 0x1c1411 }, // brown
];
const SKIN_TONES = [0xeec39a, 0xd9a77e, 0xb98256, 0x8a5a3c, 0xf6d2b8, 0xc89874];
const FACES = ['none', 'star', 'stripe', 'blaze'];
const SOCKS = [0.11, 0.2, 0.3, 0.46]; // coronet, pastern, sock, stocking
const PATTERNS = ['plain', 'hoops', 'sash', 'stripes', 'quarters'];
const PATCHES = 5;

// Paints that take markings, silks patterns and sleeve patterns
const MARKABLE = new Set(['coat', 'leg', 'muzzle'].map((name) => PAINTS.indexOf(name)));
const SILKS = PAINTS.indexOf('silks');
const SLEEVE = PAINTS.indexOf('sleeve');

// A small, well-mixed random number generator (mulberry32)
function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Every entrant always gets the same horse and rider: it comes from their position
export function lookFor(index) {
  const random = seeded(index * 7919 + 17);
  const coat = COATS[(index * 5 + 2) % COATS.length];
  const pinto = random() < 0.2;
  return {
    ...coat,
    silks: silksFor(index),
    patches: pinto
      ? Array.from({ length: PATCHES }, () => [-0.9 + random() * 2, 1.0 + random() * 0.9, (random() < 0.5 ? -1 : 1) * 0.3, 0.16 + random() * 0.2])
      : [],
    face: FACES[Math.floor(random() * FACES.length)],
    socks: [0, 1, 2, 3].map(() => (random() < 0.3 ? SOCKS[Math.floor(random() * SOCKS.length)] : 0)), // front R, L, hind R, L
    skin: SKIN_TONES[Math.floor(random() * SKIN_TONES.length)],
    size: 0.97 + random() * 0.06, // some horses are a little bigger than others
  };
}

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// The broad colour of each paint on one horse and rider
function painter(look) {
  const color = (hex) => new THREE.Color(hex);
  const { silks } = look;
  const coat = color(look.coat);
  const belly = coat.clone().multiplyScalar(1.22).lerp(color(0xe8d2b0), 0.08);
  const topline = coat.clone().multiplyScalar(0.86);
  const points = color(look.points);
  const white = color(WHITE);
  const dapple = coat.clone().lerp(white, 0.3);
  const primary = color(silks.primary);
  const fixed = {
    mane: color(look.mane),
    muzzle: coat.clone().lerp(color(0x2a2220), 0.55),
    hoof: color(0x37302b),
    paleHoof: color(0xc6ae8c),
    inner: color(0x1b1412),
    ear: coat.clone().lerp(color(0x1c1512), 0.55),
    cloth: white,
    clothTrim: primary,
    saddle: color(0x5a3a26),
    girth: color(0x2b3340),
    bridle: color(0x2a1d15),
    noseband: white,
    eye: color(0x120d0b),
    glint: color(0xffffff),
    iron: color(0xc3c8cf),
    silks: primary,
    sleeve: primary,
    collar: color(silks.secondary),
    breeches: color(0xf3f2ee),
    boot: color(0x1c1c1f),
    bootTop: color(0xa8743f),
    skin: color(look.skin),
    cap: color(silks.secondary),
    pompom: primary,
    peak: color(silks.secondary).lerp(color(0x000000), 0.2),
    goggles: color(0x22262c),
    lens: color(0x3a4c60),
    glove: color(0xf7f7f7),
    whip: color(0x151515),
    rein: color(0x2a1d15),
  };
  const mane = fixed.mane.clone();
  const darkMane = fixed.mane.clone().lerp(fixed.inner, 0.3);

  return function paint(index, x, y, z, out) {
    switch (PAINTS[index]) {
      case 'coat':
        // a paler belly and slightly darker topline, like a real coat
        out.copy(coat);
        if (x < 0.8) out.lerp(belly, smoothstep(1.12, 0.94, y) * 0.7);
        out.lerp(topline, smoothstep(1.55, 1.78, y));
        if (look.dapples && x < 0.9 && y > 1.0 && Math.sin(x * 26) * Math.sin(y * 24 + 1.3) * Math.sin(z * 22 + x * 9) > 0.35) out.lerp(dapple, 0.6);
        return out;
      case 'leg':
        // darker points below the knees and hocks
        return out.copy(coat).lerp(points, smoothstep(0.8, 0.6, y));
      case 'hoof':
        return out.copy(look.socks[(x > 0 ? 0 : 2) + (z > 0 ? 0 : 1)] ? fixed.paleHoof : fixed.hoof);
      case 'mane':
        return out.copy(mane).lerp(darkMane, 0.5 + 0.5 * Math.sin(x * 70 + z * 50));
      case 'eye':
        return out.copy(fixed.eye);
      default:
        return out.copy(fixed[PAINTS[index]] ?? white);
    }
  };
}

// Per-vertex colours for one horse (16-bit, so dark coats shade smoothly)
export function paintModel({ paints }, look) {
  const paint = painter(look);
  const { positions, paintA, paintB, paintMix } = paints;
  const colours = new Uint16Array(paintA.length * 3);
  const a = new THREE.Color();
  const b = new THREE.Color();
  for (let v = 0; v < paintA.length; v++) {
    const [x, y, z] = [positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]];
    paint(paintA[v], x, y, z, a);
    if (paintMix[v] > 0.01) a.lerp(paint(paintB[v], x, y, z, b), paintMix[v]);
    colours[v * 3] = a.r * 65535;
    colours[v * 3 + 1] = a.g * 65535;
    colours[v * 3 + 2] = a.b * 65535;
  }
  return new THREE.Uint16BufferAttribute(colours, 3, true);
}

// Per-vertex inputs to the markings shader, the same for every horse:
// marks = how much each vertex takes horse markings, silks and sleeve
// patterns; shade = baked ambient occlusion
export function markAttributes({ paintA, paintB, paintMix, ao }) {
  const marks = new Float32Array(paintA.length * 3);
  const shade = new Float32Array(paintA.length);
  const weight = (set, v) => (set(paintA[v]) ? 1 - paintMix[v] : 0) + (set(paintB[v]) ? paintMix[v] : 0);
  for (let v = 0; v < paintA.length; v++) {
    marks[v * 3] = weight((p) => MARKABLE.has(p), v);
    marks[v * 3 + 1] = weight((p) => p === SILKS, v);
    marks[v * 3 + 2] = weight((p) => p === SLEEVE, v);
    shade[v] = 0.58 + 0.42 * ao[v];
  }
  return { marks: new THREE.BufferAttribute(marks, 3), shade: new THREE.BufferAttribute(shade, 1) };
}

const vec2 = ([x, y]) => `vec2(${x.toFixed(4)}, ${y.toFixed(4)})`;
const TORSO = { from: [-0.15, 1.99], to: [0.36, 2.15] };
const MARKINGS = /* glsl */ `
attribute vec3 marks;
attribute float shade;
varying vec3 vRest;
varying vec3 vMarks;
varying float vShade;
`;
const MARKINGS_FRAGMENT = /* glsl */ `
uniform vec4 uPatches[${PATCHES}];
uniform vec4 uSocks;
uniform float uFace;
uniform float uPattern;
uniform vec3 uWhite;
uniform vec3 uPink;
uniform vec3 uPrimary;
uniform vec3 uSecondary;
varying vec3 vRest;
varying vec3 vMarks;
varying float vShade;

// How much of a shape with signed distance d covers this pixel (antialiased)
float cover(float d) {
  float w = max(fwidth(d), 1e-5) * 0.8;
  return 1.0 - smoothstep(-w, w, d);
}

// White markings: pinto patches, socks and a face marking
vec4 horseMarkings(vec3 p) {
  float white = 0.0;
  for (int i = 0; i < ${PATCHES}; i++) {
    vec4 spot = uPatches[i];
    if (spot.w <= 0.0) continue;
    float wobble = 0.045 * sin(p.x * 21.0 + p.y * 7.0) * sin(p.y * 17.0 - p.z * 5.0);
    white = max(white, cover(length((p - spot.xyz) * vec3(1.0, 1.0, 0.6)) + wobble - spot.w));
  }
  float sock = p.x > 0.0 ? (p.z > 0.0 ? uSocks.x : uSocks.y) : (p.z > 0.0 ? uSocks.z : uSocks.w);
  if (sock > 0.0) white = max(white, cover(p.y - sock - 0.012 * sin(p.x * 60.0 + p.z * 40.0)));
  float pink = 0.0;
  if (uFace > 0.5 && p.x > 1.15) {
    vec2 u = vec2(${Math.cos(HEAD_ANGLE).toFixed(4)}, ${Math.sin(HEAD_ANGLE).toFixed(4)});
    vec2 r = p.xy - ${vec2(POLL)};
    float t = dot(r, u) / 0.69;
    float front = -r.x * u.y + r.y * u.x;
    float star = 0.04 * (1.0 - abs(t - 0.24) / 0.11);
    float width = star;
    if (uFace > 1.5) width = max(star, 0.016 * smoothstep(0.26, 0.32, t) * (1.0 - smoothstep(0.78, 0.84, t)));
    if (uFace > 2.5) width = (0.034 + max(0.0, t - 0.7) * 0.18) * smoothstep(0.1, 0.14, t);
    float face = cover(abs(p.z) - width) * cover(0.02 - front);
    white = max(white, face);
    pink = face * smoothstep(0.86, 0.92, t);
  }
  return vec4(mix(uWhite, uPink, pink), white);
}

// Nostrils and the line of the lips, drawn dark on the muzzle
float muzzleLines(vec3 p) {
  if (p.x < 1.5) return 0.0;
  vec2 u = vec2(${Math.cos(HEAD_ANGLE).toFixed(4)}, ${Math.sin(HEAD_ANGLE).toFixed(4)});
  vec2 r = p.xy - ${vec2(POLL)};
  float t = dot(r, u) / 0.69;
  float front = -r.x * u.y + r.y * u.x;
  // a slanted oval each side of the nose
  vec2 n = vec2((t - 0.935) * 0.69, front - 0.028);
  n = vec2(n.x * 0.8 + n.y * 0.6, -n.x * 0.6 + n.y * 0.8);
  float nostril = cover(length(vec3(n.x / 0.03, n.y / 0.013, (abs(p.z) - 0.05) / 0.035)) - 1.0);
  float lips = cover(abs(front + 0.074 - (t - 0.92) * 0.05) - 0.0035) * smoothstep(0.82, 0.86, t);
  return max(nostril, lips);
}

// Racing silks: u goes around the body, v from the hips to the shoulders
float silksPattern(float u, float v) {
  if (uPattern > 3.5) return cover((u - 0.5) * (v - 0.5)); // quarters
  if (uPattern > 2.5) return cover(sin(u * 62.83) / 62.83); // stripes
  if (uPattern > 1.5) return cover(abs(fract(u + v * 0.5) - 0.5) - 0.12); // sash
  if (uPattern > 0.5) return cover(sin(v * 15.71) / 15.71); // hoops
  return 0.0;
}

vec3 torsoSilks(vec3 p) {
  vec2 from = ${vec2(TORSO.from)};
  vec2 axis = ${vec2(TORSO.to)} - from;
  float len = length(axis);
  axis /= len;
  vec2 r = p.xy - from;
  float v = clamp(dot(r, axis) / len, 0.0, 1.0);
  float up = -r.x * axis.y + r.y * axis.x;
  float u = fract(atan(p.z, up) / 6.2831853 + 1.0);
  return mix(uPrimary, uSecondary, silksPattern(u, v));
}

vec3 sleeveSilks(vec3 p) {
  float d = length(p - vec3(${RIDER.shoulder[0].toFixed(3)}, ${RIDER.shoulder[1].toFixed(3)}, ${RIDER.shoulder[2].toFixed(3)} * sign(p.z)));
  float stripes = step(2.5, uPattern) * step(uPattern, 3.5);
  float cuff = cover(0.46 - d);
  float band;
  if (uPattern > 0.5 && uPattern < 1.5) band = cover(sin(d * 41.9) / 41.9); // hooped sleeves
  else if (stripes > 0.5) band = 1.0; // sleeves in the second colour
  else band = cover(abs(d - 0.16) - 0.03); // armbands
  float second = mix(band, 1.0 - stripes, cuff); // cuffs contrast with the sleeve
  return mix(uPrimary, uSecondary, second);
}
`;

// A material for one horse and rider: shared toon shading with that horse's
// markings and silks drawn per pixel
export function markingsMaterial(look) {
  const { silks } = look;
  const uniforms = {
    uPatches: { value: Array.from({ length: PATCHES }, (_, i) => new THREE.Vector4(...(look.patches[i] ?? [0, 0, 0, 0]))) },
    uSocks: { value: new THREE.Vector4(...look.socks) },
    uFace: { value: FACES.indexOf(look.face) },
    uPattern: { value: PATTERNS.indexOf(silks.pattern) },
    uWhite: { value: new THREE.Color(WHITE) },
    uPink: { value: new THREE.Color(0xc89a90) },
    uPrimary: { value: new THREE.Color(silks.primary) },
    uSecondary: { value: new THREE.Color(silks.secondary) },
  };
  return toon(0xffffff, {
    vertexColors: true,
    extend: {
      name: 'markings',
      compile(shader) {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', `#include <common>\n${MARKINGS}`)
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest = position;\nvMarks = marks;\nvShade = shade;');
        shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${MARKINGS_FRAGMENT}`).replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          vec4 marking = horseMarkings(vRest);
          diffuseColor.rgb = mix(diffuseColor.rgb, marking.rgb, marking.a * vMarks.x);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.03, 0.022, 0.02), muzzleLines(vRest) * vMarks.x);
          diffuseColor.rgb = mix(diffuseColor.rgb, torsoSilks(vRest), vMarks.y);
          diffuseColor.rgb = mix(diffuseColor.rgb, sleeveSilks(vRest), vMarks.z);
          diffuseColor.rgb *= vShade;`,
        ).replace(
          '#include <opaque_fragment>',
          `#if NUM_DIR_LIGHTS > 0
          // a soft sheen on the coat, like a groomed racehorse
          vec3 halfway = normalize(directionalLights[0].direction + normalize(vViewPosition));
          float gloss = pow(max(dot(normalize(normal), halfway), 0.0), 14.0);
          outgoingLight += directionalLights[0].color * diffuseColor.rgb * smoothstep(0.35, 0.95, gloss) * 0.22 * vMarks.x;
          #endif
          #include <opaque_fragment>`,
        );
      },
    },
  });
}
