# Melbourne Cup

Energy Matrix Group's office Melbourne Cup sweep. It picks a raffle winner by running a 3D horse race where each horse is an entrant.

Add entrants in the browser (they're kept in that browser's local storage, so they survive a refresh, and you can remove them). When you start the race, the server draws the winner at random and saves it to the database, then the race is animated so that horse wins at the line.

## The race

- **A painterly, Breath of the Wild-inspired course:** soft cel shading with warm rim light, sun shadows that follow the action, a meadow of swaying grass and wildflowers, lush trees, a painted sky and hazy snow-capped mountains, plus the grandstand, crowd, lake and winning post
- **Detailed horses and jockeys:** sculpted horses in seven coat colours with pinto patches, socks and blazes, nodding heads and streaming tails; jockeys in patterned silks with helmets, goggles and reins, riding harder in the straight
- **Horses don't run through each other:** they hug the rail, plan ahead to go around runners they're catching, and are kept apart if they touch (`public/js/race/pack.js`)
- **Pick 1, 2, 3 or 5 laps.** The lead changes as the field moves through the pack, and the crowd gets louder in the final lap
- **TV-style coverage:** the camera cuts between side-on, chase, head-on and blimp shots, with a live leaderboard, lap counter and name tags on the top three
- **A race caller** (`public/js/race/caller.js`) calls it like the real thing: the running order with margins in lengths, lead changes, "past the post, two laps to go", the bell, down the back, around the home turn, into the straight and a finish that builds to the line. It's on screen and **spoken aloud** by the browser's built-in voice (an Australian voice when one is installed), getting faster and more excited as the race builds
- **Crowd sounds**, synthesised live with no audio files (and silent between races): a murmur at the barrier, a roar that builds through the final lap, hoofbeats that get louder in close-up shots, the starting and final-lap bells, a muffled slow-motion effect, a gasp and hush at a photo finish, and cheering, applause and whistles for the winner. The **Sound on/off** button mutes everything and is remembered in that browser
- **Photo finish:** in a close race it drops into slow motion down the straight, hides the positions, then freezes with the winning nose on the line before revealing the winner
- **Racing colours:** every entrant gets their own silks (brand colours and patterns) and saddle-cloth number, shown in the entrant list too, so people can spot their horse
- **Fullscreen** button for putting the race on the office TV
- **Graphics quality** starts high and steps down automatically on slower computers. Add `?quality=low`, `?quality=medium` or `?quality=high` to the address to fix it

## Branding

The app follows the Energy Matrix Group brand from [energymatrix.com.au](https://www.energymatrix.com.au/):

- **Colours** (CSS variables at the top of `public/css/styles.css`): slate `#415A7E`, coral `#E47454`, navy `#2B3340`, sky `#9DC0D7`, ice `#CCEBF7`, grey `#718096`
- **Type:** Montserrat, served from `node_modules/@fontsource/montserrat` so it works offline
- **Style:** square corners, thin rules, two-tone slate and coral headings with coral eyebrows, outline coral buttons, faint background diamonds, the angled slate header tab and a navy footer
- **Logos** in `public/img/`: `emg-logo.svg` (header and trackside signage), `emg-logo-reversed.svg` (footer) and `emg-mark.svg` (browser tab icon), taken from the company website
- **On the course:** Energy Matrix boards on the inside rail, a billboard in the infield beside the winning post (so it appears in the photo-finish shot), the company name along the grandstand roof, a slate and coral grandstand, a coral winning post, and jockey silks, crowd and confetti in brand colours

### How the winner is guaranteed

The server draws the winner (`POST /api/draw`, using a cryptographic random number) and saves it before anything moves. The browser then choreographs the race backwards from that result (`public/js/race/script.js`): every horse's position is the pack's pace plus its own offset, and at the winner's finishing time the winner's offset is exactly zero while everyone else's is negative. Horses never move backwards, so nobody can reach the line first. The pack that keeps horses apart only ever moves them sideways or holds a horse *other than the winner* back, so it can't change the result. `npm test` checks all of this over hundreds of simulated races.

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
npm ci

# 3. Start the server (restarts automatically when server files change)
npm run dev
```

Open **http://localhost:3000** in your browser. Stop the server with `Ctrl+C`.

| Command         | What it does                                         |
| --------------- | ---------------------------------------------------- |
| `npm run dev`   | Start the server and restart it on back-end changes  |
| `npm start`     | Start the server without watching for changes        |
| `npm test`      | Check the draw API, that the race always finishes with the drawn winner, that horses don't overlap, and that the caller never gives the result away early |

Front-end changes (anything in `public/`) only need a browser refresh.

**Use a different port:** `PORT=4000 npm run dev` (macOS/Linux) or `$env:PORT=4000; npm run dev` (Windows PowerShell).

**Start with an empty database:** stop the server and delete `data/melbourne-cup.db`. It's recreated on the next start. (Entrants live in the browser: remove them with the × buttons.)

**Upgrading from an earlier version:** past draws in an existing database are kept and moved into the new format automatically. Entrants that were stored on the server aren't used any more, so add them again in the browser.

## Project layout

```
server/
  index.js            Starts the server
  app.js              Express app: API routes, static files, error handling
  db.js               SQLite connection, table setup and upgrade of old databases
  routes/draws.js     POST /api/draw, GET /api/draws
public/
  index.html          The single page: entrant list, track, winner banner
  css/styles.css      Energy Matrix brand styles
  img/                Energy Matrix logos
  js/main.js          Page wiring: forms, buttons, lists
  js/entrants.js      The entrant list, kept in the browser's local storage
  js/api.js           fetch() wrappers for the API
  js/silks.js         Racing colours and saddle-cloth numbers for each entrant
  js/sound/effects.js Crowd, hoofbeats, bells and cheering (Web Audio, no files)
  js/sound/voice.js   Spoken commentary (browser speech synthesis)
  js/race/index.js    The race: horses, leaderboard, cameras, slow motion, quality
  js/race/script.js   Race choreography that guarantees the drawn winner (no Three.js)
  js/race/pack.js     Keeps horses from running through each other (no Three.js)
  js/race/caller.js   The race caller's commentary (no Three.js)
  js/race/track.js    Oval track, sky, mountains, grass, trees and scenery
  js/race/horse.js    Horse and jockey models, gallop animation
  js/race/shapes.js   Smooth lofted shapes the horses and jockeys are sculpted from
  js/race/camera.js   TV-style camera shots
  js/race/toon.js     Cel-shading materials and outlines
test/                 API, race script, pack and caller tests (node --test)
data/                 SQLite database file (git-ignored)
```

## Data

Entrants are kept in the browser's local storage (key `melbourne-cup-entrants`) as `[{ id, name, ticket_number }]`.

| Table   | Columns                                                                 |
| ------- | ----------------------------------------------------------------------- |
| `draws` | `id`, `winner_name`, `winner_ticket_number`, `field_size`, `drawn_at` |

## API

| Method | Path         | Body                                        | Returns                                                       |
| ------ | ------------ | ------------------------------------------- | ------------------------------------------------------------- |
| POST   | `/api/draw`  | `{ entrants: [{ name, ticket_number }] }`   | `{ draw, winnerIndex, winner }` (2–200 entrants, unique tickets) |
| GET    | `/api/draws` |                                             | Past draws, newest first                                      |

## Troubleshooting

- **`npm install` fails with `EPERM: operation not permitted` (Windows):** another program is holding files in `node_modules`, usually a running dev server, your editor, or OneDrive/antivirus. Stop the server, close other terminals in this folder, then run `Remove-Item -Recurse -Force node_modules` in PowerShell and `npm install` again.
- **`ExperimentalWarning: SQLite is an experimental feature` on start:** Node 22 prints this for the built-in SQLite module. It's harmless, and Node 24 doesn't print it.
- **`No such built-in module: node:sqlite`:** your Node is older than 22.13. Upgrade from [nodejs.org](https://nodejs.org/).
- **`EADDRINUSE` on start:** something else is using port 3000. Pick another port as shown above.
- **The track area is blank:** your browser needs WebGL. Check the browser console for errors.
- **No sound:** check the Sound button says "Sound on" and the computer isn't muted. Browsers only allow sound after a click, so it starts when you press Start race.
- **The commentary voice sounds robotic or American:** the voice comes from your operating system and browser. On Windows, add an English (Australia) voice under Settings > Time & language > Speech; Microsoft Edge also has natural-sounding online voices.
- **The race looks slow or choppy:** quality steps down automatically, and the race slows down rather than skipping ahead when the computer can't keep up. Try `?quality=low` on the end of the address, close other heavy tabs, or use a machine with a better graphics chip for the big screen.
- **My entrants disappeared:** they're stored in the browser you added them in. A different browser, a private window, or clearing site data starts with an empty list.

## Scope

- **Must have:** add entrants, random draw saved to the database, race finishes with the right winner
- **Nice to have:** photo-finish slow motion, race commentary, past winners list
- **Out of scope:** logins, payments, deployment
