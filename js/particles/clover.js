// particles/clover.js
export default function generateCloverPoints(count, cx, cy, r = 60, leaves = 4) {
  const points = [];
  for (let l = 0; l < leaves; l++) {
    const angleOffset = (l / leaves) * Math.PI * 2;
    for (let i = 0; i < count / leaves; i++) {
      const angle = (i / (count / leaves)) * Math.PI * 2;
      const x = cx + Math.cos(angleOffset) * r + (r / 2) * Math.cos(angle);
      const y = cy + Math.sin(angleOffset) * r + (r / 2) * Math.sin(angle);
      points.push({ x, y });
    }
  }
  return points;
}
