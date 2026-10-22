import * as api from './api.js';
import { createRace } from './race.js';

const els = {
  form: document.querySelector('#entrant-form'),
  formMessage: document.querySelector('#form-message'),
  entrantList: document.querySelector('#entrant-list'),
  entrantCount: document.querySelector('#entrant-count'),
  drawList: document.querySelector('#draw-list'),
  startButton: document.querySelector('#start-race'),
  track: document.querySelector('#race-track'),
  winnerBanner: document.querySelector('#winner-banner'),
  winnerName: document.querySelector('#winner-name'),
  winnerTicket: document.querySelector('#winner-ticket'),
  commentary: document.querySelector('#commentary'),
};

const race = createRace(els.track);

// Builds list items with textContent so entrant names can't inject HTML
function listItem(label, meta) {
  const li = document.createElement('li');
  const labelEl = document.createElement('span');
  const metaEl = document.createElement('span');
  labelEl.textContent = label;
  metaEl.textContent = meta;
  metaEl.className = 'meta';
  li.append(labelEl, metaEl);
  return li;
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
  renderList(els.entrantList, entrants, '[Placeholder] No entrants yet. Add the first one above.', (e) =>
    listItem(e.name, `#${e.ticket_number}`),
  );
  race.setField(entrants);
}

async function refreshDraws() {
  const draws = await api.getDraws();
  renderList(els.drawList, draws, '[Placeholder] Winners from previous races will be listed here.', (d) =>
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
  els.startButton.disabled = true;
  els.winnerBanner.hidden = true;

  try {
    // The server draws the winner first; the race is then animated to match
    const { winner, entrants } = await api.drawWinner();
    els.commentary.textContent = "[Placeholder] And they're off!";
    race.setField(entrants);
    await race.run(winner.id);

    els.winnerName.textContent = winner.name;
    els.winnerTicket.textContent = `Ticket #${winner.ticket_number}`;
    els.winnerBanner.hidden = false;
    els.commentary.textContent = `[Placeholder] ${winner.name} takes the Cup!`;
    await refreshDraws();
  } catch (err) {
    els.commentary.textContent = err.message;
  } finally {
    els.startButton.disabled = false;
  }
});

Promise.all([refreshEntrants(), refreshDraws()]).catch((err) => {
  els.commentary.textContent = `Couldn't reach the server: ${err.message}`;
});
