// Racing colours for each entrant. They're based on the entrant's position in
// the field (ordered by id), so the sidebar list and the 3D race always agree.
// The saddle-cloth number is the position plus one.

const WHITE = '#ffffff';
const NAVY = '#2b3340';

// Energy Matrix brand colours (logo and site palette), each with accents that
// contrast with it. Every colour/pattern pair is unique for the first 50 runners.
const COLOURS = [
  ['#415a7e', ['#e47454', WHITE, '#ccebf7']], // slate
  ['#e47454', [NAVY, WHITE]], // coral
  ['#9dc0d7', ['#415a7e', NAVY, '#e47454']], // sky
  [NAVY, ['#e47454', '#ccebf7', WHITE]], // navy
  ['#13612e', [WHITE, '#f5a524']], // green
  ['#f5a524', [NAVY, '#415a7e']], // amber
  ['#1159af', [WHITE, '#ccebf7']], // blue
  ['#ccebf7', ['#415a7e', '#e47454', NAVY]], // ice
  ['#b82105', [WHITE, NAVY]], // red
  ['#f7630c', [NAVY, WHITE]], // orange
];
const PATTERNS = ['plain', 'hoops', 'sash', 'stripes', 'quarters'];

export function silksFor(index) {
  const round = Math.floor(index / COLOURS.length);
  const [primary, accents] = COLOURS[index % COLOURS.length];
  return {
    number: index + 1,
    primary,
    secondary: accents[round % accents.length],
    pattern: PATTERNS[(index + round) % PATTERNS.length],
    ...numberColours(primary),
  };
}

// Saddle-cloth number colours on the primary colour: navy on light colours,
// white on dark ones, with a halo so it still reads over a pattern
function numberColours(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const light = 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.55;
  return light ? { ink: NAVY, halo: WHITE } : { ink: WHITE, halo: NAVY };
}

// Inline styles for a number badge on the entrant's silks
export function badgeStyle(silks) {
  return { background: silksBackground(silks), color: silks.ink, textShadow: `0 0 2px ${silks.halo}, 0 0 2px ${silks.halo}` };
}

// CSS background that mimics the silks pattern, for swatches
export function silksBackground({ primary, secondary, pattern }) {
  switch (pattern) {
    case 'hoops':
      return `repeating-linear-gradient(0deg, ${primary} 0 4px, ${secondary} 4px 8px)`;
    case 'stripes':
      return `repeating-linear-gradient(90deg, ${primary} 0 4px, ${secondary} 4px 8px)`;
    case 'sash':
      return `linear-gradient(135deg, ${primary} 0 36%, ${secondary} 36% 64%, ${primary} 64%)`;
    case 'quarters':
      return `conic-gradient(${primary} 0 25%, ${secondary} 0 50%, ${primary} 0 75%, ${secondary} 0)`;
    default:
      return primary;
  }
}

// The silks pattern at a point on the jockey's shirt, for painting it onto the
// 3D rider: u goes around the body (0..1), v runs from the hips to the shoulders
export function silksColourAt({ primary, secondary, pattern }, u, v) {
  switch (pattern) {
    case 'hoops':
      return Math.floor(v * 5) % 2 ? secondary : primary;
    case 'stripes':
      return Math.floor(u * 10) % 2 ? secondary : primary;
    case 'sash':
      return Math.abs(((u + v * 0.5) % 1) - 0.5) < 0.12 ? secondary : primary;
    case 'quarters':
      return u < 0.5 !== v < 0.5 ? secondary : primary;
    default:
      return primary;
  }
}
