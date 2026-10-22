import * as api from './api.js';
import { createRace } from './race/index.js';
import { silksBackground, silksFor } from './silks.js';

const els = {
  form: document.querySelector('#entrant-form'),
  formMessage: document.querySelector('#form-message'),
  entrantList: document.querySelector('#entrant-list'),
  entrantCount: document.querySelector('#entrant-count'),
  drawList: document.querySelector('#draw-list'),
  racePanel: document.querySelector('#race-panel'),
  laps: document.querySelector('#laps'),
  fullscreen: document.querySelector('#fullscreen'),
  startButton: document.querySelector('#start-race'),
  track: document.querySelector('#race-track'),
  winnerBanner: document.querySelector('#winner-banner'),
  winnerName: document.querySelector('#winner-name'),
  winnerTicket: document.querySelector('#winner-ticket'),
  commentary: document.querySelector('#commentary'),
};

const race = createRace(els.track);
let racing = false;

// Builds list items with textContent so entrant names can't inject HTML
function listItem(label, meta, badge) {
  const li = document.createElement('li');
  const labelEl = document.createElement('span');
  const metaEl = document.createElement('span');
  labelEl.textContent = label;
  if (badge) labelEl.prepend(badge);
  metaEl.textContent = meta;
  metaEl.className = 'meta';
  li.append(labelEl, metaEl);
  return li;
}

// Saddle-cloth number on the entrant's racing colours
function silkBadge(index) {
  const silks = silksFor(index);
  const badge = document.createElement('span');
  badge.className = 'silk';
  badge.style.background = silksBackground(silks);
  badge.textContent = silks.number;
  return badge;
}

function renderList(listEl, items, emptyText, toItem) {
  if (items.length) {
    listEl.replaceChildren(...items.map(toItem));
    return;
  }
  const li = document.createElement('li');
  li.className = 'placeholder';
  li.textContent = emptyText;
  listEl.replaceChildren(li);
}

async function refreshEntrants() {
  const entrants = await api.getEntrants();
  els.entrantCount.textContent = entrants.length;
  renderList(els.entrantList, entrants, 'No entrants yet. Add the first one above.', (e, index) =>
    listItem(e.name, `#${e.ticket_number}`, silkBadge(index)),
  );
  if (!racing) race.setField(entrants);
}

async function refreshDraws() {
  const draws = await api.getDraws();
  renderList(els.drawList, draws, 'Winners from previous races will be listed here.', (d) =>
    listItem(d.winner_name, `#${d.winner_ticket_number} · ${new Date(d.drawn_at).toLocaleString()}`),
  );
}

els.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await api.addEntrant(Object.fromEntries(new FormData(els.form)));
    els.form.reset();
    els.formMessage.textContent = '';
    els.form.elements.namedItem('name').focus();
    await refreshEntrants();
  } catch (err) {
    els.formMessage.textContent = err.message;
  }
});

els.startButton.addEventListener('click', async () => {
  racing = true;
  els.startButton.disabled = true;
  els.laps.disabled = true;
  els.winnerBanner.hidden = true;

  try {
    // The server draws the winner first; the race is then choreographed to match
    const { winner, entrants } = await api.drawWinner();
    const number = entrants.findIndex((e) => e.id === winner.id) + 1;
    race.setField(entrants);
    await race.run(winner.id, {
      laps: Number(els.laps.value),
      onCommentary: (text) => {
        els.commentary.textContent = text;
      },
    });

    els.winnerName.textContent = `#${number} ${winner.name}`;
    els.winnerTicket.textContent = `Ticket #${winner.ticket_number}`;
    els.winnerBanner.hidden = false;
    await refreshDraws();
  } catch (err) {
    els.commentary.textContent = err.message;
  } finally {
    racing = false;
    els.startButton.disabled = false;
    els.laps.disabled = false;
  }
});

els.fullscreen.addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else els.racePanel.requestFullscreen?.();
});

document.addEventListener('fullscreenchange', () => {
  els.fullscreen.textContent = document.fullscreenElement ? 'Exit fullscreen' : 'Fullscreen';
});

Promise.all([refreshEntrants(), refreshDraws()]).catch((err) => {
  els.commentary.textContent = `Couldn't reach the server: ${err.message}`;
});
