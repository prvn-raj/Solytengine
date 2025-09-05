// particles/galaxy.js
export default function generateGalaxyPoints(count, cx, cy, arms = 3, turns = 2, spread = 100) {
  const points = [];
  for (let i = 0; i < count; i++) {
    const arm = i % arms;
    const t = (i / count) * Math.PI * 2 * turns;
    const radius = (i / count) * spread;
    const angle = t + (arm * (Math.PI * 2)) / arms;
    const x = cx + radius * Math.cos(angle);
    const y = cy + radius * Math.sin(angle);
    points.push({ x, y });
  }
  return points;
}
