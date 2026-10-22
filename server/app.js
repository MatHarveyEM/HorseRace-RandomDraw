import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import drawsRouter from './routes/draws.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const app = express();
app.use(express.json());

// API
app.use('/api', drawsRouter);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Front end: Three.js and the Montserrat font are served straight from
// node_modules, so nothing needs a CDN and it all works offline
app.use('/vendor/three', express.static(path.join(ROOT, 'node_modules', 'three')));
app.use('/vendor/fonts/montserrat', express.static(path.join(ROOT, 'node_modules', '@fontsource', 'montserrat')));
app.use(express.static(path.join(ROOT, 'public')));

app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Something went wrong' : err.message });
});

export default app;
