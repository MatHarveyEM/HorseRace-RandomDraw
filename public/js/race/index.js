// The 3D race. main.js only needs two calls:
//   setField(entrants)                     line up one horse per entrant behind the barrier
//   run(winnerId, { laps, onCommentary })  run the race, resolving once the winner is announced
// onCommentary(text, { urgent, pace }) gets each call from the race caller.
// Pass { effects } to createRace for sound.
//
// Graphics quality starts high and steps down on slower computers. Add
// ?quality=low, medium or high to the address to fix it.
import * as THREE from 'three';
import { OutlineEffect } from 'three/addons/effects/OutlineEffect.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { badgeStyle } from '../silks.js';
import { createDirector } from './camera.js';
import { createCaller } from './caller.js';
import { HORSE_LENGTH, createHorse, gallop } from './horse.js';
import { LOOK_AHEAD, createPack } from './pack.js';
import { CRUISE_SPEED, ROW_GAP, createRaceScript, startingSlot } from './script.js';
import { INK } from './toon.js';
import { HOME_STRAIGHT_RUN, LAP_LENGTH, RADIUS, STRAIGHT, buildVenue, isOnStraight, trackPoint } from './track.js';

const INSIDE = 0.8; // closest a horse runs to the inside rail
const OUTSIDE = 15.2; // ...and to the outside rail
const START_LANE_WIDTH = 1.75;
const COUNT_SECONDS = 0.9;
const CLOSE_FINISH = 1.2; // winning margin (metres) that triggers a photo finish
const BOARD_ROWS = 8;
const ROW_HEIGHT = 26;
// Camera rotation during the race: [shot, seconds]
const RACE_SHOTS = [['tracking', 6], ['chase', 5], ['blimp', 5], ['inside', 5], ['headon', 4.5]];
// How close each camera shot is to the horses, for the volume of the hooves
const SHOT_NEARNESS = { idle: 0, start: 0.5, tracking: 0.7, inside: 0.6, chase: 0.85, headon: 1, blimp: 0.25, stretch: 1, finish: 0.9, winner: 0.6 };
// The last lap's landmarks, as distance still to run, for the race caller
const BEND = Math.PI * RADIUS;
const LANDMARKS = {
  backStraight: LAP_LENGTH - (STRAIGHT + BEND - HOME_STRAIGHT_RUN),
  homeTurn: HOME_STRAIGHT_RUN + BEND,
  straight: HOME_STRAIGHT_RUN,
};
const QUALITY = {
  high: { pixelRatio: 2, shadows: 2048, grass: 45000, flowers: 1500 },
  medium: { pixelRatio: 1.25, shadows: 1024, grass: 16000, flowers: 600 },
  low: { pixelRatio: 1, shadows: 0, grass: 0, flowers: 0 },
};
const LEVELS = ['high', 'medium', 'low'];

export function createRace(container, { effects = null } = {}) {
  const requested = new URLSearchParams(window.location.search).get('quality');
  const quality = { level: LEVELS.includes(requested) ? requested : 'high', fixed: LEVELS.includes(requested) };

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.shadowMap.type = THREE.PCFShadowMap;
  container.appendChild(renderer.domElement);
  const outlines = new OutlineEffect(renderer, { defaultThickness: 0.0028, defaultColor: new THREE.Color(INK).toArray() });

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.className = 'race-labels';
  container.appendChild(labelRenderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 1600);
  const venue = buildVenue(scene, QUALITY[quality.level]);
  const director = createDirector(camera);
  const hud = createHud(container);
  const confetti = createConfetti(scene);

  let horses = [];
  let race = null; // the race in progress, or the one that just finished
  let excitement = 0;
  let time = 0;
  const point = {};

  function applyQuality(level) {
    quality.level = level;
    const settings = QUALITY[level];
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, settings.pixelRatio));
    const shadows = settings.shadows > 0;
    if (renderer.shadowMap.enabled !== shadows) {
      renderer.shadowMap.enabled = shadows;
      scene.traverse((object) => {
        for (const material of [object.material].flat()) if (material) material.needsUpdate = true;
      });
    }
    venue.setQuality(settings);
    for (const horse of horses) {
      horse.shadow.visible = !shadows; // a soft blob instead
      horse.setDetail(level);
    }
    resize();
  }

  // Step down a quality level if it's running below about 32 frames a second,
  // judged over two-second windows once things have settled
  const frames = { count: 0, since: performance.now() + 3000 };
  function watchFrameRate(now) {
    if (quality.fixed || quality.level === 'low' || now < frames.since) return;
    frames.count++;
    const elapsed = (now - frames.since) / 1000;
    if (elapsed < 2) return;
    if (frames.count / elapsed < 32) applyQuality(LEVELS[LEVELS.indexOf(quality.level) + 1]);
    frames.count = 0;
    frames.since = now;
  }

  function placeHorse(horse, yawOffset = 0) {
    trackPoint(horse.s - horse.nose, horse.y, point);
    horse.group.position.set(point.x, 0, point.z);
    horse.group.rotation.y = Math.atan2(-point.dz, point.dx) - yawOffset;
  }

  function setField(entrants) {
    if (race && race.phase !== 'finished') return; // never swap horses mid-race

    for (const horse of horses) {
      scene.remove(horse.group);
      horse.dispose();
    }
    horses = entrants.map((entrant, index) => {
      const horse = createHorse(entrant, index, { detail: quality.level });
      const slot = startingSlot(index);
      Object.assign(horse, { s: -slot.row * ROW_GAP, y: INSIDE + 0.1 + slot.lane * START_LANE_WIDTH, step: 0 });
      horse.shadow.visible = !renderer.shadowMap.enabled;
      placeHorse(horse);
      scene.add(horse.group);
      return horse;
    });
    race = null;
    hud.reset();
    labelRenderer.domElement.hidden = false;
    confetti.stop();
    director.cut('idle');
  }

  function run(winnerId, { laps = 3, onCommentary = () => {} } = {}) {
    const ids = horses.map((h) => h.id);
    const script = createRaceScript({ ids, winnerId, laps, lapLength: LAP_LENGTH });
    const close = script.margin < CLOSE_FINISH;
    return new Promise((resolve) => {
      race = {
        script,
        laps,
        resolve,
        close,
        winner: horses.find((h) => h.id === winnerId),
        pack: createPack({ ids, winnerId, startY: horses.map((h) => h.y), inside: INSIDE, outside: OUTSIDE }),
        caller: createCaller({ laps, distance: script.distance, lapLength: LAP_LENGTH, landmarks: LANDMARKS, horseLength: HORSE_LENGTH, style: script.style, close, winnerId }),
        speak: (call) => onCommentary(call.text, { urgent: call.urgent, pace: call.pace }),
        phase: 'countdown', // countdown -> running -> (photo) -> finished
        clock: 0, // real seconds in the current phase
        time: 0, // race seconds (slows down in slow motion)
        timeScale: 1,
        slowTo: 1,
        push: 0, // how hard the jockeys are riding
        order: null,
        lap: 1,
        shot: 0,
        shotClock: 0,
        boardClock: 0,
        said: new Set(),
      };
      hud.showBoard(horses, laps);
      director.cut('start');
      race.speak(race.caller.loading(horses));
    });
  }

  function moveHorses(raceDt) {
    if (raceDt > 0) {
      const t = race.time;
      race.pack.step(raceDt, new Map(horses.map((h) => [h.id, { s: race.script.positionAt(h.id, t), ahead: race.script.positionAt(h.id, t + LOOK_AHEAD) }])));
    }
    for (const horse of horses) {
      const { s, y, vy } = race.pack.get(horse.id);
      horse.step = Math.max(0, s - horse.s); // never backwards
      horse.s += horse.step;
      horse.y = y;
      horse.vy = vy;
    }
    const order = [...horses].sort((a, b) => b.s - a.s);

    const leaders = order.slice(0, 3);
    const leaderSpeed = raceDt > 0 ? leaders.reduce((sum, h) => sum + h.step, 0) / leaders.length / raceDt : 0;
    race.speed = Math.min(1, leaderSpeed / CRUISE_SPEED);

    for (const horse of order) {
      const speed = raceDt > 0 ? horse.step / raceDt : 0;
      placeHorse(horse, Math.atan2(horse.vy, Math.max(speed, 4)));
      gallop(horse, horse.step, Math.min(1, speed / CRUISE_SPEED), race.push);
    }
    return order;
  }

  function countdown() {
    const step = Math.floor(race.clock / COUNT_SECONDS);
    if (step === race.countStep) return 0.4;
    race.countStep = step;
    if (step < 3) {
      hud.callout(String(3 - step));
      effects?.cue('beep');
      return 0.4;
    }
    race.phase = 'running';
    race.clock = 0;
    hud.callout('GO!');
    effects?.cue('go');
    director.cut(RACE_SHOTS[0][0]);
    race.speak(race.caller.jump());
    return 0.4;
  }

  function announce() {
    const { winner } = race;
    const wasPhoto = race.phase === 'photo';
    race.phase = 'finished';
    race.clock = 0;
    race.slowTo = 1;
    hud.setSuspense(false);
    labelRenderer.domElement.hidden = false;
    hud.setTitle('RESULT');
    const runnerUp = race.order.find((h) => h !== winner);
    const margin = runnerUp && winner.s > runnerUp.s ? winner.s - runnerUp.s : race.script.margin;
    race.speak(race.caller.result(winner.name, margin, wasPhoto));
    effects?.cue('cheer');
    confetti.burst();
    race.resolve();
  }

  // Commentary, camera cuts and slow motion while the horses are running
  function callTheRace(dt) {
    const { script, order } = race;
    const [leader] = order;
    const toLine = script.finishTime - race.time;
    const lap = Math.min(race.laps, Math.floor(Math.max(0, leader.s) / LAP_LENGTH) + 1);
    const homeTurn = lap === race.laps && leader.s > script.distance - HOME_STRAIGHT_RUN - 25;

    const call = race.caller.update(
      race.time,
      order.map((h) => ({ id: h.id, name: h.name, s: h.s, y: h.y })),
      toLine,
    );
    if (call) race.speak(call);

    if (lap > race.lap) {
      race.lap = lap;
      if (lap === race.laps) {
        hud.callout('FINAL LAP');
        effects?.cue('bell');
      }
    }
    if (homeTurn && !race.said.has('home')) {
      race.said.add('home');
      director.cut('stretch');
      effects?.cue('roar');
    }
    // The jockeys get down to work on the last lap and ride flat out in the straight
    const pushTo = race.said.has('home') ? 1 : lap === race.laps ? 0.35 : 0;
    race.push += (pushTo - race.push) * Math.min(1, dt * 2);

    // Slow motion into the line; a photo-finish camera if it's close
    if (race.close && toLine < 1.2 && !race.said.has('slow')) {
      race.said.add('slow');
      race.slowTo = 0.25;
      director.cut('stretch');
      hud.setSuspense(true);
      labelRenderer.domElement.hidden = true;
    } else if (!race.close && toLine < 0.6) {
      race.slowTo = 0.45;
    }
    if (race.close && toLine < 0.4 && director.shot !== 'finish') director.cut('finish');

    if (race.time >= script.finishTime) {
      if (!race.close) return announce();
      race.phase = 'photo';
      race.clock = 0;
      race.timeScale = 0;
      hud.flash();
      hud.callout('PHOTO FINISH');
      effects?.cue('gasp');
      race.speak(race.caller.photo());
      return;
    }

    if (!race.said.has('home')) {
      race.shotClock += dt;
      if (race.shotClock > RACE_SHOTS[race.shot][1]) {
        race.shotClock = 0;
        const canGoHeadOn = isOnStraight(leader.s) && isOnStraight(leader.s + 26);
        do {
          race.shot = (race.shot + 1) % RACE_SHOTS.length;
        } while (RACE_SHOTS[race.shot][0] === 'headon' && !canGoHeadOn);
        director.cut(RACE_SHOTS[race.shot][0]);
      }
    }
  }

  // Returns how excited the crowd should be (0..1)
  function stepRace(dt) {
    race.clock += dt;
    if (race.phase === 'countdown') return countdown();
    if (race.phase === 'photo') {
      if (race.clock > 2.4) announce();
      return 1;
    }

    race.timeScale += (race.slowTo - race.timeScale) * Math.min(1, dt * 5);
    // A photo finish freezes with the winner's nose exactly on the line
    const stopAt = race.close && race.phase === 'running' ? race.script.finishTime : race.script.endTime;
    const next = Math.min(race.time + dt * race.timeScale, stopAt);
    const raceDt = next - race.time;
    race.time = next;
    race.order = moveHorses(raceDt);

    if (race.phase === 'running') {
      callTheRace(dt);
    } else if (race.phase === 'finished') {
      race.push += (0 - race.push) * Math.min(1, dt);
      if (race.clock > 1.5 && director.shot !== 'winner') director.cut('winner');
      if (race.clock > 3.5 && !race.said.has('placings')) {
        race.said.add('placings');
        race.speak(race.caller.placings(race.order));
      }
    }

    race.boardClock -= dt;
    if (race.boardClock <= 0) {
      race.boardClock = 0.2;
      hud.updateBoard(race.order, race.lap, race.laps);
    }

    if (race.phase === 'finished') return race.clock < 8 ? 1 : race.clock < 14 ? 0.4 : 0.1;
    if (race.said.has('home')) return 1;
    return race.lap === race.laps && race.laps > 1 ? 0.7 : 0.35;
  }

  function focus() {
    const order = race?.order;
    if (!order) return { s: 0, leaderS: 0, winner: null, time };
    const leading = order.slice(0, 3);
    return {
      s: leading.reduce((sum, horse) => sum + horse.s, 0) / leading.length,
      leaderS: order[0].s,
      winner: race.winner.group,
      time,
    };
  }

  function resize() {
    const { clientWidth: width, clientHeight: height } = container;
    if (!width || !height) return;
    renderer.setSize(width, height);
    labelRenderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container);
  applyQuality(quality.level);

  let last = performance.now();
  renderer.setAnimationLoop((now) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    time += dt;
    watchFrameRate(now);

    const wantExcitement = race ? stepRace(dt) : 0.08;
    excitement += (wantExcitement - excitement) * Math.min(1, dt * 2);
    confetti.update(dt, race?.winner.group.position);
    const focused = focus();
    director.update(focused);
    venue.update(time, excitement, trackPoint(focused.s, 7, point), camera.position);
    effects?.update({
      excitement,
      gallop: race?.speed ?? 0,
      runners: horses.length,
      near: SHOT_NEARNESS[director.shot] ?? 0.5,
      timeScale: race && race.phase !== 'countdown' ? race.timeScale : 1,
    });

    const standing = !race || race.phase === 'countdown';
    for (const horse of horses) {
      if (standing) gallop(horse, 0, 0, 0, time);
      horse.updateDetail(camera);
    }
    outlines.render(scene, camera);
    labelRenderer.render(scene, camera);
  });

  return { setField, run };
}

// Leaderboard, big call-outs (countdown, FINAL LAP, PHOTO FINISH) and the flash
function createHud(container) {
  const root = document.createElement('div');
  root.className = 'race-hud';
  root.innerHTML = `
    <div class="hud-board" hidden><div class="hud-title"></div><ol class="hud-rows"></ol></div>
    <div class="hud-callout"></div>
    <div class="hud-flash"></div>`;
  container.appendChild(root);

  const board = root.querySelector('.hud-board');
  const title = root.querySelector('.hud-title');
  const list = root.querySelector('.hud-rows');
  const callout = root.querySelector('.hud-callout');
  const flash = root.querySelector('.hud-flash');
  let rows = new Map();

  const replay = (element, className) => {
    element.classList.remove(className);
    void element.offsetWidth; // restart the CSS animation
    element.classList.add(className);
  };

  return {
    reset() {
      board.hidden = true;
      root.classList.remove('suspense');
      callout.classList.remove('show');
    },
    setSuspense(on) {
      root.classList.toggle('suspense', on);
    },
    showBoard(horses, laps) {
      rows = new Map();
      list.replaceChildren();
      list.style.height = `${Math.min(horses.length, BOARD_ROWS) * ROW_HEIGHT}px`;
      for (const horse of horses) {
        const row = document.createElement('li');
        row.innerHTML = '<span class="pos"></span><span class="silk"></span><span class="name"></span>';
        Object.assign(row.querySelector('.silk').style, badgeStyle(horse.silks));
        row.querySelector('.silk').textContent = horse.number;
        row.querySelector('.name').textContent = horse.name;
        row.style.transform = `translateY(${Math.min(rows.size, BOARD_ROWS) * ROW_HEIGHT}px)`;
        row.classList.toggle('off-board', rows.size >= BOARD_ROWS);
        row.firstChild.textContent = rows.size + 1;
        list.append(row);
        rows.set(horse.id, row);
      }
      title.textContent = `LAP 1 / ${laps}`;
      board.hidden = false;
    },
    setTitle(text) {
      title.textContent = text;
    },
    updateBoard(order, lap, laps) {
      if (title.textContent !== 'RESULT') title.textContent = `LAP ${lap} / ${laps}`;
      order.forEach((horse, rank) => {
        const row = rows.get(horse.id);
        row.style.transform = `translateY(${Math.min(rank, BOARD_ROWS) * ROW_HEIGHT}px)`;
        row.classList.toggle('off-board', rank >= BOARD_ROWS);
        row.firstChild.textContent = rank + 1;
        if (rank < 3) horse.tag.dataset.rank = rank;
        else delete horse.tag.dataset.rank;
      });
    },
    callout(text) {
      callout.textContent = text;
      replay(callout, 'show');
    },
    flash() {
      replay(flash, 'show');
    },
  };
}

function createConfetti(scene) {
  const COUNT = 240;
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  material.userData.outlineParameters = { visible: false };
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.3, 0.15), material, COUNT);
  mesh.frustumCulled = false;
  mesh.visible = false;
  const group = new THREE.Group();
  group.add(mesh);
  scene.add(group);

  // Energy Matrix colours
  const colours = [0xe47454, 0x415a7e, 0x9dc0d7, 0xccebf7, 0xffffff, 0x2b3340].map((c) => new THREE.Color(c));
  const bits = Array.from({ length: COUNT }, (_, i) => {
    mesh.setColorAt(i, colours[i % colours.length]);
    return { position: new THREE.Vector3(), velocity: new THREE.Vector3(), rotation: new THREE.Euler(), spin: new THREE.Vector3() };
  });
  const dummy = new THREE.Object3D();
  let life = 0;

  return {
    burst() {
      life = 8;
      mesh.visible = true;
      for (const bit of bits) {
        bit.position.set((Math.random() - 0.5) * 8, 8 + Math.random() * 6, (Math.random() - 0.5) * 8);
        bit.velocity.set((Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3);
        bit.spin.set(Math.random() * 9, Math.random() * 9, Math.random() * 9);
      }
    },
    stop() {
      life = 0;
      mesh.visible = false;
    },
    // Falls around `follow` (the winner) as they pull up
    update(dt, follow) {
      if (life <= 0) return;
      life -= dt;
      mesh.visible = life > 0;
      if (follow) group.position.set(follow.x, 0, follow.z);
      bits.forEach((bit, i) => {
        bit.velocity.y = Math.max(bit.velocity.y - 5 * dt, -1.4);
        bit.position.addScaledVector(bit.velocity, dt);
        bit.rotation.x += bit.spin.x * dt;
        bit.rotation.y += bit.spin.y * dt;
        bit.rotation.z += bit.spin.z * dt;
        dummy.position.copy(bit.position);
        dummy.rotation.copy(bit.rotation);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
