// The field of entrants, kept in this browser's local storage so it survives a
// page refresh. Starts empty. Each entrant is { id, name, ticket_number }.
const KEY = 'melbourne-cup-entrants';
const MAX_TEXT = 60;

export function createEntrantStore() {
  let entrants = load();

  // Returns false if the browser won't let us save (e.g. storage is blocked)
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(entrants));
      return true;
    } catch {
      return false;
    }
  }

  return {
    get all() {
      return entrants;
    },
    // Returns { error } or { entrant, saved }
    add(rawName, rawTicket) {
      const name = String(rawName ?? '').trim();
      const ticket = String(rawTicket ?? '').trim();
      if (!name || !ticket) return { error: 'Both a name and a ticket number are needed' };
      if (name.length > MAX_TEXT || ticket.length > MAX_TEXT) return { error: `Keep names and tickets under ${MAX_TEXT} characters` };
      if (entrants.some((e) => e.ticket_number === ticket)) return { error: `Ticket ${ticket} has already been entered` };

      const entrant = { id: Math.max(0, ...entrants.map((e) => e.id)) + 1, name, ticket_number: ticket };
      entrants = [...entrants, entrant];
      return { entrant, saved: save() };
    },
    remove(id) {
      entrants = entrants.filter((e) => e.id !== id);
      return save();
    },
  };
}

function load() {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    if (!Array.isArray(stored)) return [];
    return stored.filter((e) => Number.isInteger(e?.id) && typeof e.name === 'string' && typeof e.ticket_number === 'string');
  } catch {
    return [];
  }
}
