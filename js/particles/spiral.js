export default function generateSpiralPoints(count, cx, cy, turns = 5, spacing = 4) {
  const points = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 * turns;
    const r = spacing * angle;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    points.push({ x, y });
  }
  return points;
}
