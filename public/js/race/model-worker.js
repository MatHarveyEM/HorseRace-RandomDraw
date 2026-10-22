// Sculpts horse and rider meshes off the main thread (see model.js)
import { buildModel, transferables } from './model.js';

self.onmessage = ({ data: level }) => {
  const model = buildModel(level);
  self.postMessage(model, transferables(model));
};
