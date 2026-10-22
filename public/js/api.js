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

// Sends the field; the server picks and saves the winner and returns winnerIndex
export const drawWinner = (entrants) =>
  request('/api/draw', {
    method: 'POST',
    body: JSON.stringify({ entrants: entrants.map(({ name, ticket_number }) => ({ name, ticket_number })) }),
  });

export const getDraws = () => request('/api/draws');
