import generateHeartPoints from "./particles/heart.js";
import generateFlowerPoints from "./particles/flower.js";
import generateStarPoints from "./particles/star.js";
import generateCrescentPoints from "./particles/crescent.js"; 
import generateSpiralPoints from "./particles/spiral.js";
import generateCloverPoints from "./particles/clover.js";
import generateGalaxyPoints from "./particles/galaxy.js";
import generateLotusPoints from "./particles/lotus.js";
import generatePyramidPoints from "./particles/pyramid.js";
import generateSunburstPoints from "./particles/sunburst.js";

import { generateAbstractPoints } from "./particles/abstract.js";

import {
  initParticles,
  updateParticles,
  drawParticles,
} from "./particles/engine.js";

(() => {
  let currentQuestionIndex = 0;
  let questions = [];
  let answered = 0;
  let answers = []; // store numeric choices for abstract mode
  const totalParticles = 500;

  const canvas = document.getElementById("visual");

  // 🎚️ Force mode (set to "abstract" or "classic")
  const forceMode = "abstract"; // 🔥 change here
  // 🛠️ Only used in classic mode
  const forceShape = "Heart";   // e.g. "Star", "Galaxy", or null for random

  // 🎲 Pool of classic shapes
  const shapeFns = [
    { name: "Heart", fn: generateHeartPoints },
    { name: "Flower", fn: generateFlowerPoints },
    { name: "Star", fn: generateStarPoints },
    { name: "Crescent", fn: generateCrescentPoints },
    { name: "Spiral", fn: generateSpiralPoints },
    { name: "Clover", fn: generateCloverPoints },
    { name: "Galaxy", fn: generateGalaxyPoints },
    { name: "Lotus", fn: generateLotusPoints },
    { name: "Pyramid", fn: generatePyramidPoints },
    { name: "Sunburst", fn: generateSunburstPoints },
  ];

  // 🔑 Decide shape generator
  let chosen;
  if (forceMode === "classic") {
    if (forceShape) {
      chosen = shapeFns.find((s) => s.name === forceShape);
    } else {
      chosen = shapeFns[Math.floor(Math.random() * shapeFns.length)];
    }
    console.log("✨ Classic shape chosen:", chosen.name);
  } else {
    chosen = {
      name: "Abstract",
      fn: (count, cx, cy) =>
        generateAbstractPoints(answers, cx, cy, count),
    };
    console.log("🎨 Abstract mode enabled");
  }

  // Stub questions
  function generateStubQuestions() {
    const pool = [
      "I enjoy solving complex problems.",
      "I prefer working in teams rather than alone.",
      "I can stay calm under pressure.",
      "I make decisions quickly and confidently.",
      "I like experimenting with new ideas.",
      "I seek feedback regularly.",
      "I handle conflicts effectively.",
      "I adapt quickly to changes.",
      "I am detail-oriented.",
      "I can motivate others easily.",
      "I prefer structure and clear instructions.",
      "I often reflect on my actions.",
      "I stay optimistic in difficult situations.",
      "I challenge existing processes.",
      "I communicate clearly and effectively.",
    ];
    return pool
      .sort(() => 0.5 - Math.random())
      .slice(0, 12)
      .map((q, i) => ({
        id: i + 1,
        text: q,
        options: [
          "Strongly Disagree",
          "Disagree",
          "Neutral",
          "Agree",
          "Strongly Agree",
        ],
      }));
  }

  function renderQuestion() {
    const container = document.getElementById("question-container");
    const progress = document.getElementById("progress-bar");
    const qNumberLabel = document.getElementById("question-number-label");

    if (currentQuestionIndex >= questions.length) {
      completeAndExit("✅ Assessment completed!");
      if (progress) progress.style.width = `100%`;
      if (qNumberLabel) qNumberLabel.textContent = `Completed`;
      return;
    }

    const q = questions[currentQuestionIndex];

    if (qNumberLabel) {
      qNumberLabel.textContent = `Question ${currentQuestionIndex + 1} of ${questions.length}`;
    }
    if (progress) {
      const pct = (answered / questions.length) * 100;
      progress.style.width = `${pct}%`;
    }

    container.innerHTML = `
      <div class="question-card">
        <h2>Q${currentQuestionIndex + 1} of ${questions.length}</h2>
        <p>${q.text}</p>
        <div class="options-container">
          ${(q.options || [])
            .map(
              (opt, i) => `
            <label class="option-box">
              <input type="radio" name="option" value="${opt}" data-choice="${i + 1}" />
              <span>${opt}</span>
            </label>`
            )
            .join("")}
        </div>
        <div class="nav-buttons">
          <button id="prev-btn" ${currentQuestionIndex === 0 ? "disabled" : ""}>Previous</button>
          <button id="next-btn">Next</button>
        </div>
      </div>
    `;

    // 🔄 Answer change logic only in abstract mode
    if (forceMode === "abstract") {
      container.querySelectorAll("input[name='option']").forEach((optEl) => {
        optEl.addEventListener("change", () => {
          answers[currentQuestionIndex] = parseInt(optEl.dataset.choice, 10);

          const newTargets = generateAbstractPoints(
            answers,
            canvas.width / 2,
            canvas.height / 2,
            totalParticles
          );
          initParticles(() => newTargets, totalParticles, canvas);
        });
      });
    }

    document.getElementById("next-btn").onclick = () => {
      const selected = container.querySelector("input[name='option']:checked");
      if (!selected) {
        alert("Please select an option");
        return;
      }
      currentQuestionIndex++;
      answered++;
      renderQuestion();
    };

    document.getElementById("prev-btn").onclick = () => {
      if (currentQuestionIndex > 0) {
        currentQuestionIndex--;
        if (answered > 0) answered--;
        renderQuestion();
      }
    };
  }

  function completeAndExit(messageText) {
    const container = document.getElementById("question-container");
    if (container) {
      container.innerHTML = `
        <div class="completion-card">
          <p>${messageText}</p>
          <button onclick="window.location.href='user_dashboard.html'">🏠 Back to Dashboard</button>
        </div>
      `;
    }
  }

  function animate() {
    requestAnimationFrame(animate);
    const ratio = questions.length > 0 ? answered / questions.length : 0;
    updateParticles(ratio);
    drawParticles(answered, questions.length);
  }

  window.addEventListener("DOMContentLoaded", () => {
    questions = generateStubQuestions();
    answers = new Array(questions.length).fill(0);

    initParticles(chosen.fn, totalParticles, canvas);
    renderQuestion();
    animate();
  });
})();
