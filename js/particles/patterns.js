// particles/patterns.js
// Different abstract pattern generators for particle targets

// Spiral galaxy
export function generateSpiralPattern(count, cx, cy) {
  const pts = [];
  for (let i = 0; i < count; i++) {
    const angle = i * 0.15;
    const r = 2 + i * 0.5;
    pts.push({
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    });
  }
  return pts;
}

// Concentric rings
export function generateRingsPattern(count, cx, cy) {
  const pts = [];
  const rings = 5;
  const perRing = Math.floor(count / rings);
  for (let r = 1; r <= rings; r++) {
    for (let i = 0; i < perRing; i++) {
      const angle = (i / perRing) * Math.PI * 2;
      const radius = r * 30;
      pts.push({
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
      });
    }
  }
  return pts;
}

// Radial burst
export function generateBurstPattern(count, cx, cy) {
  const pts = [];
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 50 + Math.random() * 150;
    pts.push({
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    });
  }
  return pts;
}

// Grid / wave
export function generateGridPattern(count, cx, cy) {
  const pts = [];
  const rows = Math.floor(Math.sqrt(count));
  const cols = rows;
  const spacing = 15;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const wave = Math.sin(c * 0.5 + r * 0.3) * 10;
      pts.push({
        x: cx + (c - cols / 2) * spacing,
        y: cy + (r - rows / 2) * spacing + wave,
      });
    }
  }
  return pts.slice(0, count);
}

// Chaotic cloud
export function generateCloudPattern(count, cx, cy) {
  const pts = [];
  for (let i = 0; i < count; i++) {
    pts.push({
      x: cx + (Math.random() - 0.5) * 300,
      y: cy + (Math.random() - 0.5) * 300,
    });
  }
  return pts;
}

// Export pool
export const abstractPatterns = [
  { name: "Spiral", fn: generateSpiralPattern },
  { name: "Rings", fn: generateRingsPattern },
  { name: "Burst", fn: generateBurstPattern },
  { name: "Grid", fn: generateGridPattern },
  { name: "Cloud", fn: generateCloudPattern },
];
