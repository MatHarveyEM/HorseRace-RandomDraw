import { Router } from 'express';
import db from '../db.js';

const router = Router();

const listEntrants = db.prepare('SELECT id, name, ticket_number FROM entrants ORDER BY id');
const insertEntrant = db.prepare('INSERT INTO entrants (name, ticket_number) VALUES (?, ?)');

// GET /api/entrants -> every entrant in the field
router.get('/', (req, res) => {
  res.json(listEntrants.all());
});

// POST /api/entrants { name, ticket_number } -> the new entrant
router.post('/', (req, res) => {
  const name = String(req.body?.name ?? '').trim();
  const ticketNumber = String(req.body?.ticket_number ?? '').trim();

  if (!name || !ticketNumber) {
    return res.status(400).json({ error: 'Both name and ticket_number are required' });
  }

  try {
    const { lastInsertRowid } = insertEntrant.run(name, ticketNumber);
    res.status(201).json({ id: Number(lastInsertRowid), name, ticket_number: ticketNumber });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: `Ticket ${ticketNumber} has already been entered` });
    }
    throw err;
  }
});

export default router;
