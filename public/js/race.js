// Three.js race track.
//
// PLACEHOLDER: boxes stand in for horses and the race is a straight run at
// constant speed. This is where the real demo moment (a close, tense finish,
// photo-finish slow motion) will be built. The only contract main.js relies on:
//   setField(entrants)  -> put one horse per entrant at the start line
//   run(winnerId)       -> animate the race, resolving once winnerId has won
import * as THREE from 'three';

const TRACK_LENGTH = 100;
const START_X = -TRACK_LENGTH / 2;
const FINISH_X = TRACK_LENGTH / 2;
const LANE_WIDTH = 2.5;
const WINNER_SECONDS = 4;

export function createRace(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fd3f0);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x2e7d50, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(30, 60, 40);
  scene.add(sun);

  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.MeshStandardMaterial({ color: 0x2e7d50 }),
  );
  grass.rotation.x = -Math.PI / 2;
  scene.add(grass);

  const dirt = new THREE.Mesh(
    new THREE.PlaneGeometry(TRACK_LENGTH + 10, 1),
    new THREE.MeshStandardMaterial({ color: 0x8b6a43 }),
  );
  dirt.rotation.x = -Math.PI / 2;
  dirt.position.y = 0.005;
  scene.add(dirt);

  const finishLine = new THREE.Mesh(
    new THREE.PlaneGeometry(0.6, 1),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  finishLine.rotation.x = -Math.PI / 2;
  finishLine.position.set(FINISH_X, 0.01, 0);
  scene.add(finishLine);

  const horseGeometry = new THREE.BoxGeometry(3, 2, 1.2);
  let horses = [];
  let onFrame = null;

  function setField(entrants) {
    for (const horse of horses) {
      scene.remove(horse.mesh);
      horse.mesh.material.dispose();
    }

    const fieldWidth = Math.max(entrants.length, 1) * LANE_WIDTH;
    horses = entrants.map((entrant, i) => {
      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(i / entrants.length, 0.7, 0.5),
      });
      const mesh = new THREE.Mesh(horseGeometry, material);
      mesh.position.set(START_X, 1, (i + 0.5) * LANE_WIDTH - fieldWidth / 2);
      scene.add(mesh);
      return { id: entrant.id, mesh };
    });

    dirt.scale.y = fieldWidth + LANE_WIDTH;
    finishLine.scale.y = fieldWidth + LANE_WIDTH;
    camera.position.set(0, 35 + fieldWidth / 2, 60 + fieldWidth);
    camera.lookAt(0, 0, 0);
  }

  // PLACEHOLDER race: every horse runs at a constant pace and the winner just
  // has the shortest finish time. Replace with the real close finish.
  function run(winnerId) {
    const finishTimes = new Map(
      horses.map((h) => [h.id, h.id === winnerId ? WINNER_SECONDS : WINNER_SECONDS + 0.2 + Math.random()]),
    );
    const raceOver = Math.max(...finishTimes.values());
    const startedAt = performance.now();

    return new Promise((resolve) => {
      onFrame = () => {
        const t = (performance.now() - startedAt) / 1000;
        for (const horse of horses) {
          const progress = Math.min(t / finishTimes.get(horse.id), 1);
          horse.mesh.position.x = START_X + progress * TRACK_LENGTH;
        }
        if (t >= raceOver) {
          onFrame = null;
          resolve();
        }
      };
    });
  }

  function resize() {
    const { clientWidth: width, clientHeight: height } = container;
    if (!width || !height) return;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  new ResizeObserver(resize).observe(container);
  setField([]);
  renderer.setAnimationLoop(() => {
    onFrame?.();
    renderer.render(scene, camera);
  });

  return { setField, run };
}
