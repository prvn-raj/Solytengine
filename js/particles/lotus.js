// particles/lotus.js
export default function generateLotusPoints(count, cx, cy, r = 80, petals = 6) {
  const points = [];
  for (let p = 0; p < petals; p++) {
    const angleOffset = (p / petals) * Math.PI * 2;
    for (let i = 0; i < count / petals; i++) {
      const t = (i / (count / petals)) * Math.PI;
      const radius = r * Math.sin(t); // petal curve
      const x = cx + radius * Math.cos(angleOffset);
      const y = cy + radius * Math.sin(angleOffset);
      points.push({ x, y });
    }
  }
  return points;
}
