import { randomInt } from 'node:crypto';
import { Router } from 'express';
import db from '../db.js';

const router = Router();

const MIN_FIELD_SIZE = 2;

const listEntrants = db.prepare('SELECT id, name, ticket_number FROM entrants ORDER BY id');
const insertDraw = db.prepare('INSERT INTO draws (winner_id) VALUES (?)');
const getDraw = db.prepare('SELECT id, winner_id, drawn_at FROM draws WHERE id = ?');
const listDraws = db.prepare(`
  SELECT d.id, d.winner_id, d.drawn_at, e.name AS winner_name, e.ticket_number AS winner_ticket_number
  FROM draws d
  JOIN entrants e ON e.id = d.winner_id
  ORDER BY d.id DESC
`);

// POST /api/draw -> the server picks the winner first, saves it, and returns
// the whole field so the client can animate a race that ends with that horse.
router.post('/draw', (req, res) => {
  const entrants = listEntrants.all();

  if (entrants.length < MIN_FIELD_SIZE) {
    return res.status(400).json({ error: `Add at least ${MIN_FIELD_SIZE} entrants before starting a race` });
  }

  const winner = entrants[randomInt(entrants.length)];
  const { lastInsertRowid } = insertDraw.run(winner.id);

  res.status(201).json({ draw: getDraw.get(lastInsertRowid), winner, entrants });
});

// GET /api/draws -> past draws, most recent first
router.get('/draws', (req, res) => {
  res.json(listDraws.all());
});

export default router;
