export default function generateFlowerPoints(count, cx, cy, petals = 6, radius = 100) {
  const points = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const r = radius * Math.sin(petals * angle);
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    points.push({ x, y });
  }
  return points;
}
