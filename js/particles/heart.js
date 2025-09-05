export default function generateHeartPoints(count, centerX, centerY) {
  const points = [];
  for (let i = 0; i < count; i++) {
    const t = Math.PI * 2 * (i / count);
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y =
      13 * Math.cos(t) -
      5 * Math.cos(2 * t) -
      2 * Math.cos(3 * t) -
      Math.cos(4 * t);

    points.push({
      x: centerX + x * 15,
      y: centerY - y * 15, // flip Y
    });
  }
  return points;
}
