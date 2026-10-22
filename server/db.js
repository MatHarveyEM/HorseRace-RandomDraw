import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The database file is created on first run. Delete it to start fresh.
export const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'melbourne-cup.db');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

// node:sqlite is built into Node.js, so there's nothing native to compile
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS entrants (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT    NOT NULL,
    ticket_number TEXT    NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS draws (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    winner_id INTEGER NOT NULL REFERENCES entrants(id),
    drawn_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
`);

export default db;
