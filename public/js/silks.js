// Racing colours for each entrant. They're based on the entrant's position in
// the field (ordered by id), so the sidebar list and the 3D race always agree.
// The saddle-cloth number is the position plus one.

const PATTERNS = ['plain', 'hoops', 'sash', 'stripes', 'quarters'];

export function silksFor(index) {
  const hue = Math.round((index * 137.508) % 360); // golden angle keeps neighbours distinct
  return {
    number: index + 1,
    primary: `hsl(${hue}, 78%, 46%)`,
    secondary: index % 3 === 0 ? 'hsl(0, 0%, 97%)' : `hsl(${(hue + 150) % 360}, 85%, 62%)`,
    pattern: PATTERNS[index % PATTERNS.length],
  };
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

// The same pattern painted onto a canvas, for the jockey's shirt texture
export function paintSilks(ctx, width, height, { primary, secondary, pattern }) {
  ctx.fillStyle = primary;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = secondary;
  if (pattern === 'hoops') {
    for (let y = 0; y < height; y += height / 4) ctx.fillRect(0, y, width, height / 8);
  } else if (pattern === 'stripes') {
    for (let x = 0; x < width; x += width / 8) ctx.fillRect(x, 0, width / 16, height);
  } else if (pattern === 'sash') {
    ctx.beginPath();
    ctx.moveTo(0, height * 0.3);
    ctx.lineTo(width, height * 0.7);
    ctx.lineTo(width, height);
    ctx.lineTo(0, height * 0.6);
    ctx.fill();
  } else if (pattern === 'quarters') {
    ctx.fillRect(0, 0, width / 2, height / 2);
    ctx.fillRect(width / 2, height / 2, width / 2, height / 2);
  }
}
