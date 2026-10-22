# Melbourne Cup

Energy Matrix Group's office Melbourne Cup sweep. It picks a raffle winner by running a 3D horse race where each horse is an entrant.

The server draws the winner first and saves it to the database. The race is then animated so that horse wins at the line.

## The race

- **Cel-shaded oval track** with a grandstand and cheering crowd, rails, winning post, infield lake and trees, drawn in a cartoon style with ink outlines
- **Pick 1, 2, 3 or 5 laps.** The lead changes as the field moves through the pack, and the crowd gets louder in the final lap
- **TV-style coverage:** the camera cuts between side-on, chase, head-on and blimp shots, with a live leaderboard, lap counter and name tags on the top three
- **Race commentary** calls the start, lead changes, each lap, the bell and the turn for home, both on screen and **spoken aloud** by the browser's built-in voice (an Australian voice when one is installed)
- **Crowd sounds**, synthesised live with no audio files: a murmur at the barrier, a roar that builds through the final lap, hoofbeats that get louder in close-up shots, the starting and final-lap bells, a muffled slow-motion effect, a gasp and hush at a photo finish, and cheering, applause and whistles for the winner. The **Sound on/off** button mutes everything and is remembered in that browser
- **Photo finish:** in a close race it drops into slow motion down the straight, hides the positions, then freezes with the winning nose on the line before revealing the winner
- **Racing colours:** every entrant gets their own silks (brand colours and patterns) and saddle-cloth number, shown in the entrant list too, so people can spot their horse
- **Fullscreen** button for putting the race on the office TV

## Branding

The app follows the Energy Matrix Group brand from [energymatrix.com.au](https://www.energymatrix.com.au/):

- **Colours** (CSS variables at the top of `public/css/styles.css`): slate `#415A7E`, coral `#E47454`, navy `#2B3340`, sky `#9DC0D7`, ice `#CCEBF7`, grey `#718096`
- **Type:** Montserrat, served from `node_modules/@fontsource/montserrat` so it works offline
- **Style:** square corners, thin rules, two-tone slate and coral headings with coral eyebrows, outline coral buttons, faint background diamonds, the angled slate header tab and a navy footer
- **Logos** in `public/img/`: `emg-logo.svg` (header and trackside signage), `emg-logo-reversed.svg` (footer) and `emg-mark.svg` (browser tab icon), taken from the company website
- **On the course:** Energy Matrix boards on the inside rail, a billboard in the infield beside the winning post (so it appears in the photo-finish shot), the company name along the grandstand roof, a slate and coral grandstand, a coral winning post, and jockey silks, crowd and confetti in brand colours

### How the winner is guaranteed

The server draws the winner (`POST /api/draw`) and saves it before anything moves. The browser then choreographs the race backwards from that result (`public/js/race/script.js`): every horse's position is the pack's pace plus its own offset, and at the winner's finishing time the winner's offset is exactly zero while everyone else's is negative. Horses never move backwards, so nobody can reach the line first. `npm test` checks this over hundreds of simulated races.

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
| `npm test`      | Check the race always finishes with the drawn winner |

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
  css/styles.css      Energy Matrix brand styles
  img/                Energy Matrix logos
  js/main.js          Page wiring: forms, buttons, lists
  js/api.js           fetch() wrappers for the API
  js/silks.js         Racing colours and saddle-cloth numbers for each entrant
  js/sound/effects.js Crowd, hoofbeats, bells and cheering (Web Audio, no files)
  js/sound/voice.js   Spoken commentary (browser speech synthesis)
  js/race/index.js    The race: horses, lanes, leaderboard, commentary, slow motion
  js/race/script.js   Race choreography that guarantees the drawn winner (no Three.js)
  js/race/track.js    Oval track geometry and scenery
  js/race/horse.js    Cel-shaded horse and jockey, gallop animation
  js/race/camera.js   TV-style camera shots
  js/race/toon.js     Cel-shading materials and outlines
scripts/seed.js       Placeholder entrants
test/                 Race script tests (node --test)
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
- **No sound:** check the Sound button says "Sound on" and the computer isn't muted. Browsers only allow sound after a click, so it starts when you press Start race.
- **The commentary voice sounds robotic or American:** the voice comes from your operating system and browser. On Windows, add an English (Australia) voice under Settings > Time & language > Speech; Microsoft Edge also has natural-sounding online voices.
- **The race looks slow or choppy:** the race slows down rather than skipping ahead when the computer can't keep up. Close other heavy tabs, or try a machine with a better graphics chip for the big screen.

## Scope

- **Must have:** add entrants, random draw saved to the database, race finishes with the right winner
- **Nice to have:** photo-finish slow motion, race commentary, past winners list
- **Out of scope:** logins, payments, deployment
