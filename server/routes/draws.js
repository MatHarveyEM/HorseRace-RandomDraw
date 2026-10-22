import { randomInt } from 'node:crypto';
import { Router } from 'express';
import db from '../db.js';

const router = Router();

export const MIN_FIELD_SIZE = 2;
export const MAX_FIELD_SIZE = 200;
const MAX_TEXT = 60;

const insertDraw = db.prepare('INSERT INTO draws (winner_name, winner_ticket_number, field_size) VALUES (?, ?, ?)');
const getDraw = db.prepare('SELECT id, winner_name, winner_ticket_number, field_size, drawn_at FROM draws WHERE id = ?');
const listDraws = db.prepare(
  'SELECT id, winner_name, winner_ticket_number, field_size, drawn_at FROM draws ORDER BY id DESC',
);

// POST /api/draw { entrants: [{ name, ticket_number }, ...] }
// The server picks the winner at random and saves it before the race is run,
// then tells the browser which entrant (by position in the list) won.
router.post('/draw', (req, res) => {
  const field = req.body?.entrants;
  if (!Array.isArray(field) || field.length < MIN_FIELD_SIZE) {
    return res.status(400).json({ error: `Add at least ${MIN_FIELD_SIZE} entrants before starting a race` });
  }
  if (field.length > MAX_FIELD_SIZE) {
    return res.status(400).json({ error: `A race can have at most ${MAX_FIELD_SIZE} entrants` });
  }

  const entrants = field.map((entrant) => ({
    name: String(entrant?.name ?? '').trim(),
    ticket_number: String(entrant?.ticket_number ?? '').trim(),
  }));
  if (entrants.some((e) => !e.name || !e.ticket_number || e.name.length > MAX_TEXT || e.ticket_number.length > MAX_TEXT)) {
    return res.status(400).json({ error: `Every entrant needs a name and a ticket number (up to ${MAX_TEXT} characters)` });
  }
  if (new Set(entrants.map((e) => e.ticket_number)).size !== entrants.length) {
    return res.status(400).json({ error: 'Each ticket number can only be entered once' });
  }

  const winnerIndex = randomInt(entrants.length);
  const winner = entrants[winnerIndex];
  const { lastInsertRowid } = insertDraw.run(winner.name, winner.ticket_number, entrants.length);

  res.status(201).json({ draw: getDraw.get(lastInsertRowid), winnerIndex, winner });
});

// GET /api/draws -> past draws, most recent first
router.get('/draws', (req, res) => {
  res.json(listDraws.all());
});

export default router;
