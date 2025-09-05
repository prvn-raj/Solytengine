let particles = [];
let canvas, ctx, centerX, centerY;

export function initParticles(shapeFn, totalParticles, canvasEl) {
  canvas = canvasEl;
  ctx = canvas.getContext("2d");
  centerX = canvas.width / 2;
  centerY = canvas.height / 2;

  const targetPoints = shapeFn(totalParticles, centerX, centerY);

  // All available shapes
  const allShapes = ["circle", "square", "triangle", "star", "diamond", "petal"];

  // Pick 3 unique random shapes
  const chosenShapes = allShapes
    .sort(() => 0.5 - Math.random())
    .slice(0, 3);

  console.log("Shapes chosen this run:", chosenShapes);

  particles = targetPoints.map((p) => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    targetX: p.x,
    targetY: p.y,
    vx: (Math.random() - 0.5) * 4,
    vy: (Math.random() - 0.5) * 4,
    shape: chosenShapes[Math.floor(Math.random() * chosenShapes.length)], // ✅ correct
    settled: false,
  }));
}


export function updateParticles(ratio) {
  // idle speed factor (start fast → end calm)
  const idleFactor = 2 * (1 - ratio) + 0.3; 
  // at start ~2.3 → high bounce, at end ~0.3 → gentle

  particles.forEach((p, i) => {
    if (i < ratio * particles.length) {
      // move toward target (heart formation)
      p.x += (p.targetX - p.x) * 0.08;
      p.y += (p.targetY - p.y) * 0.08;
      p.settled = true;
    } else {
      // bounce motion for idle particles
      p.x += p.vx * idleFactor;
      p.y += p.vy * idleFactor;

      // bounce off walls
      if (p.x < 0 || p.x > canvas.width) {
        p.vx *= -1;
        p.x = Math.max(0, Math.min(canvas.width, p.x));
      }
      if (p.y < 0 || p.y > canvas.height) {
        p.vy *= -1;
        p.y = Math.max(0, Math.min(canvas.height, p.y));
      }
    }
  });
}

export function drawParticles(answered, totalQuestions) {
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Heartbeat factor (only when assessment is complete)
  const heartbeat =
    answered === totalQuestions
      ? 1 + Math.sin(Date.now() / 250) * 0.2 // pulse ±20%
      : 1;

  particles.forEach((p, i) => {
    const distToTarget = Math.hypot(p.targetX - p.x, p.targetY - p.y);
    const progress = Math.min(1, 1 - distToTarget / 50);

    // color transition: gray → red-magenta glow
    const hue = 340 + Math.random() * 10;
    const lightness = 40 + 30 * progress;
    const color = `hsl(${hue}, 80%, ${lightness}%)`;

    // base size + pulsing shimmer
    const baseSize = 6 * (1 - i / particles.length);
    const shimmer = Math.sin(Date.now() / 200 + i) * 0.5;
    let size = Math.max(1, baseSize + shimmer);

    // apply heartbeat finale
    size *= heartbeat;

    ctx.shadowBlur = 20 * progress;
    ctx.shadowColor = color;
    ctx.fillStyle = color;

    // 🎨 draw based on shape
switch (p.shape.toLowerCase()) {
  case "circle":
    ctx.beginPath();
    ctx.arc(p.x, p.y, size / 2, 0, 2 * Math.PI);
    ctx.fill();
    break;

  case "square":
    ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
    break;

  case "triangle":
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - size);
    ctx.lineTo(p.x - size, p.y + size);
    ctx.lineTo(p.x + size, p.y + size);
    ctx.closePath();
    ctx.fill();
    break;

  case "star":
    ctx.beginPath();
    let spikes = 5;
    let outerRadius = size;
    let innerRadius = size / 2;
    let rot = (Math.PI / 2) * 3;
    let step = Math.PI / spikes;

    ctx.moveTo(p.x, p.y - outerRadius);
    for (let j = 0; j < spikes; j++) {
      ctx.lineTo(
        p.x + Math.cos(rot) * outerRadius,
        p.y + Math.sin(rot) * outerRadius
      );
      rot += step;
      ctx.lineTo(
        p.x + Math.cos(rot) * innerRadius,
        p.y + Math.sin(rot) * innerRadius
      );
      rot += step;
    }
    ctx.closePath();
    ctx.fill();
    break;

  case "diamond":
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - size);
    ctx.lineTo(p.x + size, p.y);
    ctx.lineTo(p.x, p.y + size);
    ctx.lineTo(p.x - size, p.y);
    ctx.closePath();
    ctx.fill();
    break;

  case "petal":
  default:
    for (let j = 0; j < 6; j++) {
      const angle = (j / 6) * 2 * Math.PI;
      ctx.beginPath();
      ctx.arc(
        p.x + Math.cos(angle) * size,
        p.y + Math.sin(angle) * size,
        size / 2,
        0,
        2 * Math.PI
      );
      ctx.fill();
    }
    break;
}


  });
}
