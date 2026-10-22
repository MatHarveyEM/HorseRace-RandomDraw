// Adds a handful of placeholder entrants so there's something to race.
// Safe to run more than once: tickets that already exist are skipped.
import db from '../server/db.js';

const PLACEHOLDER_ENTRANTS = [
  ['Placeholder Pat', '001'],
  ['Sample Sam', '002'],
  ['Demo Dana', '003'],
  ['Example Alex', '004'],
  ['Test Taylor', '005'],
  ['Mock Morgan', '006'],
];

const insert = db.prepare('INSERT OR IGNORE INTO entrants (name, ticket_number) VALUES (?, ?)');

let added = 0;
for (const [name, ticketNumber] of PLACEHOLDER_ENTRANTS) {
  added += insert.run(name, ticketNumber).changes;
}

console.log(`Added ${added} placeholder entrant(s).`);
