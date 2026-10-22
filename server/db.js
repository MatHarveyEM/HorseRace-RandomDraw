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

// Entrants live in the browser (local storage); each draw records who won
db.exec(`
  CREATE TABLE IF NOT EXISTS draws (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    winner_name          TEXT    NOT NULL,
    winner_ticket_number TEXT    NOT NULL,
    field_size           INTEGER,
    drawn_at             TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
`);

// Databases from earlier versions stored entrants on the server and draws as
// a winner_id. Copy those draws into the new shape so the history is kept.
const drawColumns = db.prepare('PRAGMA table_info(draws)').all().map((column) => column.name);
if (drawColumns.includes('winner_id')) {
  db.exec(`
    PRAGMA foreign_keys = OFF;
    BEGIN;
    CREATE TABLE draws_new (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      winner_name          TEXT    NOT NULL,
      winner_ticket_number TEXT    NOT NULL,
      field_size           INTEGER,
      drawn_at             TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
    INSERT INTO draws_new (id, winner_name, winner_ticket_number, drawn_at)
      SELECT d.id, COALESCE(e.name, 'Unknown'), COALESCE(e.ticket_number, '?'), d.drawn_at
      FROM draws d LEFT JOIN entrants e ON e.id = d.winner_id;
    DROP TABLE draws;
    ALTER TABLE draws_new RENAME TO draws;
    COMMIT;
    PRAGMA foreign_keys = ON;
  `);
}

export default db;
