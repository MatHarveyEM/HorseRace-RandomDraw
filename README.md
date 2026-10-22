# Melbourne Cup

Picks a raffle winner by running a 3D horse race where each horse is an entrant.

The server draws the winner first and saves it to the database. The race is then animated so that horse wins at the line.

> **Status:** boilerplate. The API and database work end to end. The UI text is placeholder and the race uses placeholder boxes moving at constant speed.

## Stack

- **Front end:** plain HTML, CSS and JavaScript (ES modules) with [Three.js](https://threejs.org/) for the track
- **Back end:** Node.js + [Express](https://expressjs.com/)
- **Database:** SQLite via Node's built-in [`node:sqlite`](https://nodejs.org/api/sqlite.html) module, stored in `data/melbourne-cup.db`

There are no native modules to compile, so you don't need Python or C++ build tools.

## Run it locally

You need **Node.js 22.13 or newer**, and 24 or newer is recommended (`node --version` to check; get it from [nodejs.org](https://nodejs.org/)).

```bash
# 1. Get the code
git clone https://github.com/MatHarveyEM/HorseRace-RandomDraw.git
cd HorseRace-RandomDraw

# 2. Install dependencies
npm install

# 3. (Optional) add some placeholder entrants to race
npm run seed

# 4. Start the server (restarts automatically when server files change)
npm run dev
```

Open **http://localhost:3000** in your browser. Stop the server with `Ctrl+C`.

| Command         | What it does                                         |
| --------------- | ---------------------------------------------------- |
| `npm run dev`   | Start the server and restart it on back-end changes  |
| `npm start`     | Start the server without watching for changes        |
| `npm run seed`  | Add six placeholder entrants (safe to run repeatedly)|

Front-end changes (anything in `public/`) only need a browser refresh.

**Use a different port:** `PORT=4000 npm run dev` (macOS/Linux) or `$env:PORT=4000; npm run dev` (Windows PowerShell).

**Start with an empty database:** stop the server and delete `data/melbourne-cup.db`. It's recreated on the next start.

## Project layout

```
server/
  index.js            Express app: API routes, static files, error handling
  db.js               SQLite connection and table setup
  routes/entrants.js  GET/POST /api/entrants
  routes/draws.js     POST /api/draw, GET /api/draws
public/
  index.html          The single page: entrant list, track, winner banner
  css/styles.css
  js/main.js          Page wiring: forms, buttons, lists
  js/api.js           fetch() wrappers for the API
  js/race.js          Three.js scene and race animation (placeholder)
scripts/seed.js       Placeholder entrants
data/                 SQLite database file (git-ignored)
```

## Data

| Table      | Columns                                 |
| ---------- | --------------------------------------- |
| `entrants` | `id`, `name`, `ticket_number` (unique)  |
| `draws`    | `id`, `winner_id` → entrants, `drawn_at`|

## API

| Method | Path             | Body                       | Returns                                         |
| ------ | ---------------- | -------------------------- | ----------------------------------------------- |
| GET    | `/api/entrants`  |                            | `[{ id, name, ticket_number }]`                 |
| POST   | `/api/entrants`  | `{ name, ticket_number }`  | The new entrant (`409` if the ticket is taken)  |
| POST   | `/api/draw`      |                            | `{ draw, winner, entrants }` (needs 2+ entrants)|
| GET    | `/api/draws`     |                            | Past draws with winner name, newest first       |

## Troubleshooting

- **`npm install` fails with `EPERM: operation not permitted` (Windows):** another program is holding files in `node_modules`, usually a running dev server, your editor, or OneDrive/antivirus. Stop the server, close other terminals in this folder, then run `Remove-Item -Recurse -Force node_modules` in PowerShell and `npm install` again.
- **`ExperimentalWarning: SQLite is an experimental feature` on start:** Node 22 prints this for the built-in SQLite module. It's harmless, and Node 24 doesn't print it.
- **`No such built-in module: node:sqlite`:** your Node is older than 22.13. Upgrade from [nodejs.org](https://nodejs.org/).
- **`EADDRINUSE` on start:** something else is using port 3000. Pick another port as shown above.
- **The track area is blank:** your browser needs WebGL. Check the browser console for errors.

## Scope

- **Must have:** add entrants, random draw saved to the database, race finishes with the right winner
- **Nice to have:** photo-finish slow motion, race commentary, past winners list
- **Out of scope:** logins, payments, deployment
