// particles/abstract.js
// Abstract generator: picks a pattern function based on answers

import { abstractPatterns } from "./patterns.js";

export function generateAbstractPoints(answers, cx, cy, count = 500) {
  // Pick last selected option; fallback to 1 if none
  const choice = answers?.[answers.length - 1] || 1;

  // Map choice → one of our abstract patterns
  const patternIndex = (choice - 1) % abstractPatterns.length;
  const pattern = abstractPatterns[patternIndex];

  console.log(`🌀 Abstract mode: using pattern "${pattern.name}" for choice ${choice}`);

  // Call the generator function
  return pattern.fn(count, cx, cy);
}
