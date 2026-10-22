// The race caller: turns what's happening on the track into a running
// commentary with the rhythm of a real race call. The running order with
// margins, lead changes, laps and the bell, the landmarks of the last lap (the
// back straight, the home turn, the straight) and a finish that builds to the line.
//
// It knows how the finish is choreographed (a late swoop, a duel or a
// wire-to-wire win) so it can call "here comes ..." like a caller who sees the
// horse coming, but it never names the winner before they reach the line.
//
// Each call is { text, urgent, pace }: urgent calls cut in over the commentator,
// and pace 0-2 is calm, lively or frantic. No Three.js here, so it's testable.

const pick = (options, random) => options[Math.floor(random() * options.length)];

// landmarks: distance from the finish line at which the leader reaches the back
// straight, the home turn and the home straight on the last lap.
export function createCaller({ laps, distance, lapLength, landmarks, horseLength, style, close, winnerId, random = Math.random }) {
  const said = new Set();
  let lastCallAt = -Infinity;
  let lastOrderAt = 0;
  let calledLeader = null; // who the audience last heard was in front
  const calledLeaders = new Set();
  let lap = 1;

  const lengths = (gap) => {
    if (gap < 0.3) return 'a nose';
    if (gap < 0.7) return 'a head';
    if (gap < 1.1) return 'a neck';
    if (gap < 1.8) return 'half a length';
    const count = Math.round(gap / horseLength);
    if (count <= 1) return 'a length';
    if (count > 6) return 'a big break';
    return `${['', '', 'two', 'three', 'four', 'five', 'six'][count]} lengths`;
  };
  const lane = (horse) => (horse.y < 2.2 ? pick(['on the rail', 'on the fence'], random) : horse.y > 10 ? pick(['out wide', 'wide out'], random) : '');
  const withLane = (horse) => [horse.name, lane(horse)].filter(Boolean).join(' ');

  function runningOrder(field) {
    const [a, b, c, d] = field;
    if (!b) return `${a.name} out on their own.`;
    const gap = lengths(a.s - b.s);
    const third = c ? `, then ${withLane(c)}` : '';
    const fourth = d && random() < 0.5 ? `, ${d.name} next` : '';
    const last = field.length > 5 && random() < 0.35 ? ` And at the tail, ${field.at(-1).name}.` : '';
    return (
      pick(
        [
          `${a.name} leads by ${gap} from ${b.name}${third}${fourth}.`,
          `${a.name} in front, ${gap} to ${b.name}${third}${fourth}.`,
          `It's ${a.name} leading the way, ${b.name} sits ${gap} back${third}.`,
          `${a.name} out in front by ${gap}. ${b.name} second${third}.`,
        ],
        random,
      ) + last
    );
  }

  function call(time, text, { urgent = false, pace = 0, leader = null } = {}) {
    lastCallAt = time;
    if (leader) {
      calledLeader = leader.id;
      calledLeaders.add(leader.id);
    }
    return { text, urgent, pace };
  }

  return {
    // Before the jump
    loading(field) {
      return call(-1, `They're loading for the Melbourne Cup. ${field.length} runners, ${laps === 1 ? 'one lap' : `${laps} laps`}.`);
    },

    // As the barriers open
    jump() {
      return call(0, pick(["And they're racing!", "They're off!", 'And away they go!'], random), { urgent: true, pace: 1 });
    },

    // Every frame while they're running. field is sorted, leader first: [{ id, name, s, y }].
    // Returns a call, or null when there's nothing new worth saying.
    update(time, field, toLine) {
      const [leader, second] = field;
      const remaining = distance - leader.s;
      const quietFor = time - lastCallAt;
      const lastLap = laps === 1 || remaining < lapLength;
      const pace = lastLap ? 1 : 0;
      const winner = field.find((h) => h.id === winnerId);

      // The finish: the home turn, into the straight, and the line
      if (lastLap && remaining < landmarks.homeTurn && !said.has('turn')) {
        said.add('turn');
        return call(time, `Around the home turn! ${leader.name} leads, ${second.name} poised to pounce!`, { urgent: true, pace: 2, leader });
      }
      if (lastLap && remaining < landmarks.straight && !said.has('straight')) {
        said.add('straight');
        if (style === 'swoop' && leader.id !== winnerId) {
          return call(time, `Into the straight! And here comes ${winner.name} down the outside!`, { urgent: true, pace: 2 });
        }
        if (style === 'duel') {
          return call(time, `Into the straight! ${leader.name} and ${second.name}, stride for stride!`, { urgent: true, pace: 2 });
        }
        return call(time, `Into the straight! ${leader.name} is holding them off, ${second.name} is coming!`, { urgent: true, pace: 2 });
      }
      if (toLine < 0.9 && !said.has('line')) {
        said.add('line');
        if (close) return call(time, `${leader.name}... ${second.name}... it's going to be a photo!`, { urgent: true, pace: 2 });
        const text = leader.id === winnerId ? `${winner.name} is going to win it!` : `${winner.name} flashing home!`;
        return call(time, text, { urgent: true, pace: 2 });
      }
      if (lastLap && remaining < landmarks.homeTurn) return null; // nothing else talks over the finish

      // Laps and the bell
      const leaderLap = Math.min(laps, Math.floor(Math.max(0, leader.s) / lapLength) + 1);
      if (leaderLap > lap) {
        lap = leaderLap;
        if (lap === laps) {
          return call(time, `There's the bell! Last lap! ${leader.name} in front, ${second.name} right there.`, { urgent: true, pace: 1, leader });
        }
        const toGo = laps - lap + 1;
        return call(time, `Past the post, ${toGo === 2 ? 'two laps' : `${toGo} laps`} to go. ${runningOrder(field)}`, { pace, leader });
      }

      // Down the back for the last time
      if (lastLap && remaining < landmarks.backStraight && !said.has('back') && said.has('settle') && quietFor > 2) {
        said.add('back');
        return call(time, `Down the back for the last time! ${runningOrder(field)}`, { pace: 1, leader });
      }

      // A new leader, compared with what the audience last heard
      if (calledLeader !== null && leader.id !== calledLeader && quietFor > 2.5) {
        const lines = calledLeaders.has(leader.id)
          ? [`${leader.name} is back in front!`, `${leader.name} regains the lead!`]
          : [`${leader.name} takes over!`, `${leader.name} hits the front!`, `${leader.name} grabs the lead from ${second.name}!`];
        return call(time, pick(lines, random), { pace: Math.max(pace, 1), leader });
      }

      // Early speed, then settling, then the running order every few seconds
      if (!said.has('early') && time > 2.5) {
        said.add('early');
        return call(time, `${leader.name} shows early speed, ${second.name} quickly away too.`, { pace: 1, leader });
      }
      if (!said.has('settle') && time > 6 && quietFor > 2) {
        said.add('settle');
        lastOrderAt = time;
        return call(time, `They settle down now. ${runningOrder(field)}`, { pace, leader });
      }
      const backCallDue = lastLap && !said.has('back') && remaining < landmarks.backStraight + 40;
      if (said.has('settle') && time - lastOrderAt > 6 && quietFor > 3 && !backCallDue) {
        lastOrderAt = time;
        return call(time, runningOrder(field), { pace, leader });
      }
      return null;
    },

    // The winner's nose is on the line
    photo() {
      return call(Infinity, 'They hit the line together... photo!', { urgent: true, pace: 2 });
    },

    result(winnerName, margin, wasPhoto) {
      const text = wasPhoto
        ? `The photo's in... it's ${winnerName}! ${winnerName} wins the Melbourne Cup by ${lengths(margin)}!`
        : `${winnerName} wins it! ${winnerName} wins the Melbourne Cup by ${lengths(margin)}!`;
      return call(Infinity, text, { urgent: true, pace: 2 });
    },

    placings(field) {
      const [a, b, c] = field;
      return call(Infinity, `${a.name} the winner${b ? `, ${b.name} second` : ''}${c ? `, ${c.name} third` : ''}.`);
    },
  };
}
