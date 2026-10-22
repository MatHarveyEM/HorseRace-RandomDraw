// Race-day sounds, synthesised live with the Web Audio API (no audio files):
// a crowd that murmurs, chatters and roars with the excitement of the race,
// galloping hooves, bells, countdown beeps, a gasp at a photo finish, and
// cheering with applause and whistles for the winner.
//
// Browsers only allow audio after a click, so call start() from a click handler.

const TICK_MS = 40;
const BABBLE_VOICES = 6;

export function createEffects() {
  let ctx = null;
  let audio = null;
  let enabled = true;
  const state = {
    excitement: 0,
    gallop: 0, // 0..1, how hard the horses are running
    runners: 0,
    near: 0, // 0..1, how close the camera is to the horses
    timeScale: 1, // below 1 in slow motion
    updatedAt: 0,
    hushed: false,
    roarUntil: 0,
    applauseUntil: 0,
    nextHoof: 0,
  };

  function start() {
    if (!enabled) return;
    if (!ctx) build();
    if (ctx.state === 'suspended') ctx.resume();
  }

  function build() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const noise = noiseBuffer(ctx, 3);

    const master = ctx.createGain();
    master.gain.value = 0.9;
    const limiter = ctx.createDynamicsCompressor();
    master.connect(limiter).connect(ctx.destination);

    // Crowd and hooves go through a low-pass "slow motion" filter and are
    // ducked while the commentator speaks
    const ducker = ctx.createGain();
    ducker.connect(master);
    const slowMotion = ctx.createBiquadFilter();
    slowMotion.type = 'lowpass';
    slowMotion.frequency.value = 18000;
    slowMotion.connect(ducker);
    const crowd = ctx.createGain();
    crowd.connect(slowMotion);
    const hooves = ctx.createGain();
    hooves.gain.value = 0.45;
    hooves.connect(slowMotion);
    const cues = ctx.createGain(); // bells, beeps and the gasp stay crisp, even in slow motion
    cues.connect(master);

    const loops = [];
    const loop = (destination) => {
      const source = ctx.createBufferSource();
      source.buffer = noise;
      source.loop = true;
      source.connect(destination);
      source.start(0, Math.random() * noise.duration);
      loops.push(source);
      return source;
    };
    const band = (frequency, q, destination) => {
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = frequency;
      filter.Q.value = q;
      filter.connect(destination);
      return filter;
    };
    const gain = (value, destination) => {
      const node = ctx.createGain();
      node.gain.value = value;
      node.connect(destination);
      return node;
    };

    // A soft wash of a big crowd
    const ambience = gain(0, crowd);
    loop(band(600, 0.5, ambience));

    // Chatter: narrow filters wandering between vowel-like pitches
    const babble = Array.from({ length: BABBLE_VOICES }, () => {
      const level = gain(0, crowd);
      const filter = band(500, 8, level);
      loop(filter);
      return { level, filter, next: 0 };
    });

    // The roar: an open "aahh" that swells with excitement
    const roar = gain(0, crowd);
    const roarVoice = loop(band(750, 2.5, roar));
    roarVoice.connect(band(1250, 3, roar));
    loop(band(2400, 0.8, gain(0.35, roar)));

    audio = { noise, ducker, slowMotion, crowd, hooves, cues, loops, ambience, babble, roar };
    setInterval(tick, TICK_MS);
  }

  // Runs every 40 ms: steers the crowd towards the current excitement and
  // schedules hoofbeats and applause slightly ahead of time
  function tick() {
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const live = performance.now() - state.updatedAt < 500; // the page is animating
    const boost = now < state.roarUntil ? 0.7 : 0;
    // Hushed = holding its breath for the photo: a low, tense murmur
    const level = state.hushed ? 0.18 : Math.min(1.4, (live ? state.excitement : 0) + boost);
    const slow = live ? state.timeScale : 1;

    // Near silent between races, a murmur at the barrier, a roar in the straight
    audio.ambience.gain.setTargetAtTime(0.13 * level, now, 0.3);
    audio.roar.gain.setTargetAtTime(0.45 * level * level, now, state.hushed ? 0.08 : 0.35);
    for (const voice of audio.babble) {
      if (now < voice.next) continue;
      voice.next = now + 0.1 + Math.random() * 0.25;
      voice.filter.frequency.setTargetAtTime(280 + Math.random() * 2200, now, 0.04);
      voice.level.gain.setTargetAtTime((0.02 + Math.random() * 0.07) * Math.min(1.5 * level, 1.4), now, 0.04);
    }
    audio.slowMotion.frequency.setTargetAtTime(450 + 17500 * slow * slow, now, 0.15);
    for (const source of audio.loops) source.playbackRate.setTargetAtTime(0.55 + 0.45 * slow, now, 0.2);

    // Hoofbeats: a few horses' worth of thuds per stride, blurring into a rumble
    const rate = live ? state.gallop * 12 * Math.min(state.runners, 4) * slow : 0;
    if (rate < 1) {
      state.nextHoof = now;
    } else {
      while (state.nextHoof < now + 0.12) {
        if (state.nextHoof >= now && state.near > 0.02) hoof(state.nextHoof, state.near * (0.4 + 0.6 * Math.random()), slow);
        state.nextHoof += (0.5 + Math.random()) / rate;
      }
    }

    // Applause: lots of individual claps, thinning out as it dies down
    if (now < state.applauseUntil) {
      const fade = Math.min(1, (state.applauseUntil - now) / 2);
      const claps = Math.round(90 * fade * (TICK_MS / 1000) + Math.random());
      for (let i = 0; i < claps; i++) clap(now + 0.05 + Math.random() * (TICK_MS / 1000), fade);
    }
  }

  function hoof(time, volume, slow) {
    const thud = ctx.createOscillator();
    thud.frequency.setValueAtTime((70 + Math.random() * 40) * (0.6 + 0.4 * slow), time);
    thud.frequency.exponentialRampToValueAtTime(40, time + 0.09);
    envelope(thud, time, 0.55 * volume, 0.11 / Math.max(slow, 0.4), audio.hooves);

    const dirt = burst(time, 0.06, 'lowpass', 900);
    envelope(dirt, time, 0.25 * volume, 0.05, audio.hooves);
  }

  function clap(time, volume) {
    const snap = burst(time, 0.03, 'bandpass', 1100 + Math.random() * 1200);
    envelope(snap, time, (0.04 + Math.random() * 0.06) * volume, 0.025, audio.crowd);
  }

  function whistle(time) {
    const tone = ctx.createOscillator();
    tone.frequency.setValueAtTime(1300, time);
    tone.frequency.exponentialRampToValueAtTime(2600, time + 0.22);
    tone.frequency.setValueAtTime(1900, time + 0.3);
    tone.frequency.exponentialRampToValueAtTime(1100, time + 0.7);
    envelope(tone, time, 0.05, 0.75, audio.crowd, 0.04);
  }

  // A racecourse bell: a bright tone rattled by the striker
  function bell(seconds) {
    const now = ctx.currentTime;
    const ring = ctx.createGain();
    ring.gain.setValueAtTime(0.0001, now);
    ring.gain.exponentialRampToValueAtTime(0.22, now + 0.02);
    ring.gain.setValueAtTime(0.22, now + seconds);
    ring.gain.exponentialRampToValueAtTime(0.0001, now + seconds + 0.5);
    const striker = ctx.createGain();
    striker.gain.value = 0.5;
    const rattle = ctx.createOscillator();
    rattle.type = 'square';
    rattle.frequency.value = 24;
    const depth = ctx.createGain();
    depth.gain.value = 0.5;
    rattle.connect(depth).connect(striker.gain);
    striker.connect(ring).connect(audio.cues);
    for (const [ratio, level] of [[1, 1], [2.76, 0.45], [5.4, 0.2]]) {
      const partial = ctx.createOscillator();
      partial.frequency.value = 940 * ratio;
      const mix = ctx.createGain();
      mix.gain.value = level;
      partial.connect(mix).connect(striker);
      partial.start(now);
      partial.stop(now + seconds + 0.6);
    }
    rattle.start(now);
    rattle.stop(now + seconds + 0.6);
  }

  function beep(frequency) {
    const tone = ctx.createOscillator();
    tone.frequency.value = frequency;
    envelope(tone, ctx.currentTime, 0.2, 0.16, audio.cues, 0.005);
  }

  function gasp() {
    const now = ctx.currentTime;
    const ooh = burst(now, 0.9, 'bandpass', 420, 2.5);
    envelope(ooh, now, 1, 0.75, audio.cues, 0.12);
    state.hushed = true;
  }

  // White noise through a filter, for one-off sounds
  function burst(time, seconds, type, frequency, q = 1) {
    const source = ctx.createBufferSource();
    source.buffer = audio.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    source.connect(filter);
    source.start(time, Math.random() * (audio.noise.duration - seconds), seconds);
    return filter;
  }

  // Quick attack, exponential decay, then the node is left to be cleaned up
  function envelope(node, time, peak, decay, destination, attack = 0.004) {
    const level = ctx.createGain();
    level.gain.setValueAtTime(0.0001, time);
    level.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), time + attack);
    level.gain.exponentialRampToValueAtTime(0.0001, time + attack + decay);
    node.connect(level).connect(destination);
    if (node.start) {
      node.start(time);
      node.stop(time + attack + decay + 0.05);
    }
  }

  return {
    start,
    get enabled() {
      return enabled;
    },
    setEnabled(on) {
      enabled = on;
      if (!ctx) return;
      if (on) ctx.resume();
      else ctx.suspend();
    },
    // Quieten the crowd while the commentator is talking
    duck(on) {
      if (audio) audio.ducker.gain.setTargetAtTime(on ? 0.55 : 1, ctx.currentTime, 0.15);
    },
    // Called every frame by the race
    update({ excitement, gallop, runners, near, timeScale }) {
      Object.assign(state, { excitement, gallop, runners, near, timeScale, updatedAt: performance.now() });
    },
    // One-off moments: 'beep', 'go', 'bell', 'roar', 'gasp', 'cheer'
    cue(name) {
      if (!ctx || ctx.state !== 'running') return;
      try {
        playCue(name);
      } catch (err) {
        // Sound is a nice extra; never let it interrupt the race
        console.warn(`Sound effect "${name}" failed:`, err);
      }
    },
  };

  function playCue(name) {
    const now = ctx.currentTime;
    if (name === 'beep') beep(880);
    if (name === 'go') {
      beep(1320);
      bell(1.1);
      state.roarUntil = now + 2.5;
    }
    if (name === 'bell') bell(1.6);
    if (name === 'roar') state.roarUntil = now + 2.5;
    if (name === 'gasp') gasp();
    if (name === 'cheer') {
      state.hushed = false;
      state.roarUntil = now + 4;
      state.applauseUntil = now + 6;
      for (let i = 0; i < 3; i++) whistle(now + 0.4 + Math.random() * 2.5);
    }
  }
}

function noiseBuffer(ctx, seconds) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}
