// The 3D race. main.js only needs two calls:
//   setField(entrants)                     line up one horse per entrant behind the barrier
//   run(winnerId, { laps, onCommentary })  run the race, resolving once the winner is announced
// onCommentary(text, { speech, urgent, excited }) gets each call, with a shorter
// version for the spoken commentary. Pass { effects } to createRace for sound.
import * as THREE from 'three';
import { OutlineEffect } from 'three/addons/effects/OutlineEffect.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { silksBackground } from '../silks.js';
import { createDirector } from './camera.js';
import { HORSE_LENGTH, NOSE, createHorse, gallop } from './horse.js';
import { CRUISE_SPEED, ROW_GAP, createRaceScript, startingSlot } from './script.js';
import { HOME_STRAIGHT_RUN, LAP_LENGTH, buildVenue, isOnStraight, trackPoint } from './track.js';

const LANE_WIDTH = 1.35;
const LANE_COUNT = 11;
const FIRST_LANE = 0.9; // offset of the innermost lane from the inside rail
const CLEARANCE = HORSE_LENGTH + 0.3; // gap needed to cut in front of another horse
const COUNT_SECONDS = 0.9;
const CLOSE_FINISH = 1.2; // winning margin (metres) that triggers a photo finish
const BOARD_ROWS = 8;
const ROW_HEIGHT = 26;
// Camera rotation during the race: [shot, seconds]
const RACE_SHOTS = [['tracking', 6], ['chase', 5], ['blimp', 5], ['inside', 5], ['headon', 4.5]];
const LEAD_CALLS = ['takes the lead!', 'hits the front!', 'surges to the lead!', 'grabs the lead!', 'goes to the front!'];
const BACK_IN_FRONT_CALLS = ['is back in front!', 'regains the lead!', 'hits the front again!'];
// How close each camera shot is to the horses, for the volume of the hooves
const SHOT_NEARNESS = { idle: 0, start: 0.5, tracking: 0.7, inside: 0.6, chase: 0.85, headon: 1, blimp: 0.25, stretch: 1, finish: 0.9, winner: 0.6 };

const pick = (options) => options[Math.floor(Math.random() * options.length)];
const tag = (horse) => `#${horse.number} ${horse.name}`;

export function createRace(container, { effects = null } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);
  const outlines = new OutlineEffect(renderer, { defaultThickness: 0.0035, defaultColor: [0.06, 0.06, 0.06] });

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.className = 'race-labels';
  container.appendChild(labelRenderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 1500);
  const venue = buildVenue(scene);
  const director = createDirector(camera);
  const hud = createHud(container);
  const confetti = createConfetti(scene);

  let horses = [];
  let race = null; // the race in progress, or the one that just finished
  let excitement = 0;
  let time = 0;
  const point = {};

  function placeHorse(horse, yawOffset = 0) {
    trackPoint(horse.s - NOSE, FIRST_LANE + horse.lane * LANE_WIDTH, point);
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
      const horse = createHorse(entrant, index);
      const slot = startingSlot(index);
      Object.assign(horse, { s: -slot.row * ROW_GAP, lane: slot.lane, targetLane: slot.lane, laneClock: 0, step: 0 });
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
    const script = createRaceScript({ ids: horses.map((h) => h.id), winnerId, laps, lapLength: LAP_LENGTH });
    return new Promise((resolve) => {
      race = {
        script,
        laps,
        resolve,
        say: onCommentary,
        winner: horses.find((h) => h.id === winnerId),
        close: script.margin < CLOSE_FINISH,
        phase: 'countdown', // countdown -> running -> (photo) -> finished
        clock: 0, // real seconds in the current phase
        time: 0, // race seconds (slows down in slow motion)
        timeScale: 1,
        slowTo: 1,
        order: null,
        lap: 1,
        leaderId: null,
        lastLeadCall: -Infinity,
        shot: 0,
        shotClock: 0,
        boardClock: 0,
        said: new Set(),
        hasLed: new Set(),
      };
      hud.showBoard(horses, laps);
      director.cut('start');
      race.say(pick(["They're loading into the barriers...", 'The field settles behind the barrier...']));
    });
  }

  // Horses ahead get first pick of lanes. Everyone else keeps their lane if it's
  // clear, swings out to get around a horse in front, and drifts back to the rail.
  function chooseLanes(order, dt) {
    const placed = [];
    for (const horse of order) {
      horse.laneClock -= dt;
      const isClear = (lane) =>
        lane >= 0 &&
        lane < LANE_COUNT &&
        placed.every((other) => Math.abs(other.s - horse.s) > CLEARANCE || Math.abs(other.targetLane - lane) >= 1);

      if (!isClear(horse.targetLane)) {
        for (let step = 1; step < LANE_COUNT; step++) {
          if (isClear(horse.targetLane + step)) {
            horse.targetLane += step;
            break;
          }
          if (isClear(horse.targetLane - step)) {
            horse.targetLane -= step;
            break;
          }
        }
        horse.laneClock = 1.2;
      } else if (horse.laneClock <= 0 && horse.targetLane > 0 && isClear(horse.targetLane - 1)) {
        horse.targetLane -= 1;
        horse.laneClock = 0.8;
      }
      placed.push(horse);
    }
  }

  function moveHorses(raceDt) {
    for (const horse of horses) {
      const s = race.script.positionAt(horse.id, race.time);
      horse.step = Math.max(0, s - horse.s);
      horse.s += horse.step;
    }
    const order = [...horses].sort((a, b) => b.s - a.s);
    if (raceDt > 0) chooseLanes(order, raceDt);

    const leaders = order.slice(0, 3);
    const leaderSpeed = raceDt > 0 ? leaders.reduce((sum, h) => sum + h.step, 0) / leaders.length / raceDt : 0;
    race.speed = Math.min(1, leaderSpeed / CRUISE_SPEED);

    for (const horse of order) {
      const before = horse.lane;
      horse.lane += (horse.targetLane - horse.lane) * (1 - Math.exp(-raceDt * 2.2));
      const speed = raceDt > 0 ? horse.step / raceDt : 0;
      const drift = raceDt > 0 ? ((horse.lane - before) * LANE_WIDTH) / raceDt : 0;
      placeHorse(horse, Math.atan2(drift, Math.max(speed, 4)));
      gallop(horse, horse.step, Math.min(1, speed / CRUISE_SPEED));
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
    race.say(pick(["And they're racing!", "They're off and racing!", 'The barriers fly open and away they go!']), { urgent: true });
    return 0.4;
  }

  function announce() {
    const { winner, script } = race;
    race.said.add('result');
    race.phase = 'finished';
    race.clock = 0;
    race.slowTo = 1;
    hud.setSuspense(false);
    labelRenderer.domElement.hidden = false;
    hud.setTitle('RESULT');
    const margin = describeMargin(script.margin);
    race.say(`${tag(winner)} wins the Melbourne Cup by ${margin}!`, {
      speech: `And the winner is... ${winner.name}! By ${margin}!`,
      urgent: true,
      excited: true,
    });
    effects?.cue('cheer');
    confetti.burst();
    race.resolve();
  }

  // Commentary, camera cuts and slow motion while the horses are running
  function callTheRace(dt) {
    const { script, order } = race;
    const [leader, second, third] = order;
    const toLine = script.finishTime - race.time;
    const lap = Math.min(race.laps, Math.floor(Math.max(0, leader.s) / LAP_LENGTH) + 1);
    // Called as the leaders round the home turn, so it isn't talked over by the finish
    const homeTurn = lap === race.laps && leader.s > script.distance - HOME_STRAIGHT_RUN - 25;

    if (lap > race.lap) {
      race.lap = lap;
      race.lastLeadCall = race.time;
      if (lap === race.laps) {
        hud.callout('FINAL LAP');
        effects?.cue('bell');
        race.say(`The bell rings, final lap! ${tag(leader)} leads from ${tag(second)}.`, {
          speech: `The bell! Final lap! ${leader.name} leads.`,
          urgent: true,
          excited: true,
        });
      } else {
        const chasers = third ? `, ${tag(second)} second, ${tag(third)} third` : ` from ${tag(second)}`;
        race.say(`Lap ${lap} of ${race.laps}: ${tag(leader)} leads${chasers}.`, {
          speech: `Lap ${lap}. ${leader.name} leads from ${second.name}.`,
        });
      }
    } else if (race.leaderId !== null && leader.id !== race.leaderId && race.time - race.lastLeadCall > 4 && toLine > 3) {
      race.say(`${tag(leader)} ${pick(race.hasLed.has(leader.id) ? BACK_IN_FRONT_CALLS : LEAD_CALLS)}`);
      race.lastLeadCall = race.time;
    }
    race.leaderId = leader.id;
    race.hasLed.add(leader.id);

    if (homeTurn && !race.said.has('home')) {
      race.said.add('home');
      director.cut('stretch');
      effects?.cue('roar');
      race.say(`They turn for home! ${tag(leader)} and ${tag(second)} fight it out down the straight!`, {
        speech: `They turn for home! ${leader.name} and ${second.name}!`,
        urgent: true,
        excited: true,
      });
    }
    if (toLine < 2.2 && !race.said.has('line')) {
      race.said.add('line');
      if (race.close) {
        race.say("Here they come... it's going to be desperately close!", { speech: "It's going to be desperately close!", excited: true });
      } else {
        race.say('Here they come to the line!', { excited: true });
      }
    }

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
      race.say('Photo finish! Too close to call...', { speech: 'Photo finish!', urgent: true, excited: true });
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

    if (race.phase === 'running') callTheRace(dt);
    else if (race.phase === 'finished' && race.clock > 1.5 && director.shot !== 'winner') director.cut('winner');

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

  let last = performance.now();
  renderer.setAnimationLoop((now) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    time += dt;

    const wantExcitement = race ? stepRace(dt) : 0.08;
    excitement += (wantExcitement - excitement) * Math.min(1, dt * 2);
    venue.update(time, excitement);
    confetti.update(dt, race?.winner.group.position);
    director.update(focus());
    effects?.update({
      excitement,
      gallop: race?.speed ?? 0,
      runners: horses.length,
      near: SHOT_NEARNESS[director.shot] ?? 0.5,
      timeScale: race && race.phase !== 'countdown' ? race.timeScale : 1,
    });

    outlines.render(scene, camera);
    labelRenderer.render(scene, camera);
  });

  return { setField, run };
}

function describeMargin(metres) {
  if (metres < 0.25) return 'a nose';
  if (metres < 0.45) return 'a short head';
  if (metres < 0.7) return 'a head';
  if (metres < 1.1) return 'a neck';
  if (metres < 1.6) return 'half a length';
  if (metres < 2.2) return 'three-quarters of a length';
  const lengths = Math.round((metres / HORSE_LENGTH) * 2) / 2;
  return lengths <= 1 ? 'a length' : `${lengths} lengths`;
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
        row.querySelector('.silk').style.background = silksBackground(horse.silks);
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

  const colours = [0xd4af37, 0xd7263d, 0xffffff, 0x2a9d8f, 0x3a86ff, 0xff006e].map((c) => new THREE.Color(c));
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
