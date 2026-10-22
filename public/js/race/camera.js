// Broadcast-style camera: a set of named shots, cut between like a TV race
// call. Each shot is worked out fresh every frame from where the horses are.
import { TRACK_WIDTH, trackPoint } from './track.js';

// Each shot returns [camera position, look-at point, field of view].
// focus = { s: middle of the leading group, leaderS, winner: Object3D, time }
const SHOTS = {
  // Before the race: a slow sweep across the field waiting at the start
  idle: (at, focus) => {
    const swing = Math.sin(focus.time * 0.12) * 0.6;
    const centre = at(-4, TRACK_WIDTH * 0.45, 1);
    return [[centre[0] + Math.sin(swing) * 24, 7, centre[2] + Math.cos(swing) * 20], centre, 45];
  },
  start: (at) => [at(10, TRACK_WIDTH + 3, 3), at(-3, TRACK_WIDTH * 0.45, 1.2), 40],
  tracking: (at, { s }) => [at(s + 3, TRACK_WIDTH + 11, 6.5), at(s, TRACK_WIDTH * 0.35, 1.2), 44],
  inside: (at, { s }) => [at(s + 2, -6, 4.5), at(s - 1, TRACK_WIDTH * 0.45, 1.2), 50],
  chase: (at, { s }) => [at(s - 15, TRACK_WIDTH * 0.5, 6), at(s + 8, TRACK_WIDTH * 0.4, 1), 50],
  headon: (at, { leaderS }) => [at(leaderS + 24, TRACK_WIDTH * 0.35, 2.4), at(leaderS - 4, TRACK_WIDTH * 0.35, 1.4), 30],
  blimp: (at, { s }) => [at(s - 25, TRACK_WIDTH + 34, 50), at(s + 8, TRACK_WIDTH / 2, 0), 42],
  stretch: (at, { s }) => [at(s + 6, TRACK_WIDTH + 8, 3.2), at(s + 1, TRACK_WIDTH * 0.3, 1.3), 38],
  // Side-on at the finish line, like a photo-finish camera
  finish: (at) => [at(0, TRACK_WIDTH + 10, 5.8), at(0, TRACK_WIDTH * 0.35, 1.2), 26],
  winner: (at, { winner, time }) => {
    const { x, z } = winner.position;
    const angle = time * 0.35;
    return [[x + Math.cos(angle) * 8, 3.2, z + Math.sin(angle) * 8], [x, 1.6, z], 40];
  },
};

export function createDirector(camera) {
  let shot = 'idle';
  const point = {};
  const at = (s, offset, y) => {
    trackPoint(s, offset, point);
    return [point.x, y, point.z];
  };

  return {
    get shot() {
      return shot;
    },
    cut(name) {
      shot = name;
    },
    update(focus) {
      const [position, target, fov] = SHOTS[shot](at, focus);
      camera.position.set(...position);
      camera.lookAt(...target);
      if (camera.fov !== fov) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }
    },
  };
}
