import * as api from './api.js';
import { createEntrantStore } from './entrants.js';
import { createRace } from './race/index.js';
import { badgeStyle, silksFor } from './silks.js';
import { createEffects } from './sound/effects.js';
import { createVoice } from './sound/voice.js';

const els = {
  form: document.querySelector('#entrant-form'),
  formMessage: document.querySelector('#form-message'),
  entrantList: document.querySelector('#entrant-list'),
  entrantCount: document.querySelector('#entrant-count'),
  drawList: document.querySelector('#draw-list'),
  racePanel: document.querySelector('#race-panel'),
  laps: document.querySelector('#laps'),
  fullscreen: document.querySelector('#fullscreen'),
  sound: document.querySelector('#sound'),
  startButton: document.querySelector('#start-race'),
  track: document.querySelector('#race-track'),
  winnerBanner: document.querySelector('#winner-banner'),
  winnerName: document.querySelector('#winner-name'),
  winnerTicket: document.querySelector('#winner-ticket'),
  commentary: document.querySelector('#commentary'),
};

const effects = createEffects();
const voice = createVoice({ onSpeakingChange: (speaking) => effects.duck(speaking) });
const race = createRace(els.track, { effects });
const store = createEntrantStore();
let racing = false;

// Builds list items with textContent so entrant names can't inject HTML
function listItem(label, meta, { badge, action } = {}) {
  const li = document.createElement('li');
  const labelEl = document.createElement('span');
  const metaEl = document.createElement('span');
  labelEl.className = 'label';
  labelEl.textContent = label;
  if (badge) labelEl.prepend(badge);
  metaEl.textContent = meta;
  metaEl.className = 'meta';
  li.append(labelEl, metaEl);
  if (action) li.append(action);
  return li;
}

function removeButton(entrant) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'remove-button';
  button.textContent = '×';
  button.title = 'Remove';
  button.setAttribute('aria-label', `Remove ${entrant.name}`);
  button.disabled = racing;
  button.addEventListener('click', () => {
    const saved = store.remove(entrant.id);
    els.formMessage.textContent = saved ? '' : NOT_SAVED;
    renderEntrants();
  });
  return button;
}

const NOT_SAVED = "This browser won't save entrants, so they'll be lost if you refresh the page.";

// Saddle-cloth number on the entrant's racing colours
function silkBadge(index) {
  const silks = silksFor(index);
  const badge = document.createElement('span');
  badge.className = 'silk';
  Object.assign(badge.style, badgeStyle(silks));
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

function renderEntrants() {
  const entrants = store.all;
  els.entrantCount.textContent = entrants.length;
  renderList(els.entrantList, entrants, 'No entrants yet. Add the first one above.', (e, index) =>
    listItem(e.name, `#${e.ticket_number}`, { badge: silkBadge(index), action: removeButton(e) }),
  );
  if (!racing) race.setField(entrants);
}

// The field is locked while a race is being run
function setRacing(on) {
  racing = on;
  els.startButton.disabled = on;
  els.laps.disabled = on;
  for (const control of els.form.elements) control.disabled = on;
  for (const button of els.entrantList.querySelectorAll('.remove-button')) button.disabled = on;
}

async function refreshDraws() {
  const draws = await api.getDraws();
  renderList(els.drawList, draws, 'Winners from previous races will be listed here.', (d) =>
    listItem(d.winner_name, `#${d.winner_ticket_number} · ${new Date(d.drawn_at).toLocaleString()}`),
  );
}

els.form.addEventListener('submit', (event) => {
  event.preventDefault();
  const data = new FormData(els.form);
  const result = store.add(data.get('name'), data.get('ticket_number'));
  if (result.error) {
    els.formMessage.textContent = result.error;
    return;
  }
  els.form.reset();
  els.formMessage.textContent = result.saved ? '' : NOT_SAVED;
  els.form.elements.namedItem('name').focus();
  renderEntrants();
});

els.startButton.addEventListener('click', async () => {
  const field = [...store.all];
  if (field.length < 2) {
    els.commentary.textContent = 'Add at least two entrants to start a race.';
    return;
  }

  setRacing(true);
  els.winnerBanner.hidden = true;
  effects.start(); // audio has to start from a click

  try {
    // The server draws the winner first; the race is then choreographed to match
    const { winnerIndex } = await api.drawWinner(field);
    const winner = field[winnerIndex];
    race.setField(field);
    await race.run(winner.id, {
      laps: Number(els.laps.value),
      onCommentary: (text, { urgent, pace } = {}) => {
        els.commentary.textContent = text;
        voice.say(text, { urgent, pace });
      },
    });

    els.winnerName.textContent = `#${winnerIndex + 1} ${winner.name}`;
    els.winnerTicket.textContent = `Ticket #${winner.ticket_number}`;
    els.winnerBanner.hidden = false;
    await refreshDraws();
  } catch (err) {
    els.commentary.textContent = err.message;
  } finally {
    setRacing(false);
  }
});

// Sound on/off, remembered in this browser
function setSound(on) {
  effects.setEnabled(on);
  voice.setEnabled(on);
  els.sound.textContent = on ? 'Sound on' : 'Sound off';
  els.sound.setAttribute('aria-pressed', String(on));
  try {
    localStorage.setItem('melbourne-cup-sound', on ? 'on' : 'off');
  } catch {
    // storage unavailable (private window); the setting just won't be remembered
  }
}

els.sound.addEventListener('click', () => {
  const on = !effects.enabled;
  setSound(on);
  if (on) effects.start();
});

try {
  setSound(localStorage.getItem('melbourne-cup-sound') !== 'off');
} catch {
  setSound(true);
}

els.fullscreen.addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else els.racePanel.requestFullscreen?.();
});

document.addEventListener('fullscreenchange', () => {
  els.fullscreen.textContent = document.fullscreenElement ? 'Exit fullscreen' : 'Fullscreen';
});

// Wait for the brand font so the saddle-cloth numbers are drawn in Montserrat
const fontsReady = document.fonts?.load('800 62px Montserrat').catch(() => {}) ?? Promise.resolve();

fontsReady.then(renderEntrants);
refreshDraws().catch((err) => {
  els.commentary.textContent = `Couldn't reach the server: ${err.message}`;
});
