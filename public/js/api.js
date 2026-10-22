// Thin wrappers around the backend API. Each returns parsed JSON or throws
// an Error carrying the server's message.

async function request(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

export const getEntrants = () => request('/api/entrants');

export const addEntrant = (entrant) =>
  request('/api/entrants', { method: 'POST', body: JSON.stringify(entrant) });

export const drawWinner = () => request('/api/draw', { method: 'POST' });

export const getDraws = () => request('/api/draws');
