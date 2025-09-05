// particles/sunburst.js
export default function generateSunburstPoints(count, cx, cy, rays = 12, r = 100) {
  const points = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const rayFactor = Math.sin((angle * rays) / 2) * 0.5 + 0.5;
    const radius = r * rayFactor;
    const x = cx + radius * Math.cos(angle);
    const y = cy + radius * Math.sin(angle);
    points.push({ x, y });
  }
  return points;
}
