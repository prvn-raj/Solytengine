export default function generateStarPoints(count, cx, cy, spikes = 5, outer = 100, inner = 40) {
  const points = [];
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const angle = (i / (spikes * 2)) * Math.PI * 2;
    points.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
  }
  // repeat/interpolate until count reached
  while (points.length < count) {
    points.push(points[Math.floor(Math.random() * points.length)]);
  }
  return points;
}
