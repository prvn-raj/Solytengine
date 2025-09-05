export default function generateCrescentPoints(count, cx, cy, r = 100) {
  const points = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    if (x > cx - r * 0.4) { // carve a crescent
      points.push({ x, y });
    }
  }
  return points;
}
