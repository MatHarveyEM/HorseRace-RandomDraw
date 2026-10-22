import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';

// A throwaway database in the old format (entrants stored on the server), to
// check that past draws are carried over when the app starts
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'melbourne-cup-'));
process.env.DB_PATH = path.join(dir, 'test.db');
const legacy = new DatabaseSync(process.env.DB_PATH);
legacy.exec(`
  CREATE TABLE entrants (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, ticket_number TEXT NOT NULL UNIQUE);
  CREATE TABLE draws (id INTEGER PRIMARY KEY AUTOINCREMENT, winner_id INTEGER NOT NULL REFERENCES entrants(id),
    drawn_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')));
  INSERT INTO entrants (name, ticket_number) VALUES ('Old Winner', '007');
  INSERT INTO draws (winner_id) VALUES (1);
`);
legacy.close();

const { default: app } = await import('../server/app.js');
let server;
let base;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const post = (body) =>
  fetch(`${base}/api/draw`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

const field = (count) => Array.from({ length: count }, (_, i) => ({ name: `Runner ${i + 1}`, ticket_number: String(i + 1) }));

test('past draws from the old database format are kept', async () => {
  const draws = await (await fetch(`${base}/api/draws`)).json();
  assert.equal(draws.length, 1);
  assert.equal(draws[0].winner_name, 'Old Winner');
  assert.equal(draws[0].winner_ticket_number, '007');
});

test('a draw picks one of the submitted entrants and saves it', async () => {
  const entrants = field(5);
  const res = await post({ entrants });
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.ok(Number.isInteger(body.winnerIndex) && body.winnerIndex >= 0 && body.winnerIndex < 5);
  assert.deepEqual(body.winner, entrants[body.winnerIndex]);
  assert.equal(body.draw.winner_name, body.winner.name);
  assert.equal(body.draw.field_size, 5);

  const draws = await (await fetch(`${base}/api/draws`)).json();
  assert.equal(draws[0].id, body.draw.id); // newest first
});

test('the draw is spread evenly across the field', async () => {
  const counts = [0, 0, 0, 0];
  for (let i = 0; i < 400; i++) counts[(await (await post({ entrants: field(4) })).json()).winnerIndex]++;
  for (const count of counts) assert.ok(count > 60 && count < 140, `uneven draw: ${counts}`);
});

test('rejects fields that are too small or invalid', async () => {
  for (const [body, message] of [
    [{}, /at least 2/],
    [{ entrants: field(1) }, /at least 2/],
    [{ entrants: field(201) }, /at most 200/],
    [{ entrants: [{ name: 'A', ticket_number: '1' }, { name: '', ticket_number: '2' }] }, /name and a ticket/],
    [{ entrants: [{ name: 'A', ticket_number: '1' }, { name: 'B', ticket_number: '1' }] }, /only be entered once/],
  ]) {
    const res = await post(body);
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, message);
  }
});
