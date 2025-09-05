// particles/pyramid.js
export default function generatePyramidPoints(count, cx, cy, size = 120) {
  const points = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(Math.sqrt(i));
    const col = i - row * row;
    const x = cx + (col - row / 2) * (size / row || 1);
    const y = cy + row * (size / Math.sqrt(count));
    points.push({ x, y });
  }
  return points;
}
