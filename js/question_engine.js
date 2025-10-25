/**
 * Solyte - Question Engine (Randomization-controlled hybrid)
 * ----------------------------------------------------------
 * randomize_questions = true  → Old ratio-based logic
 * randomize_questions = false → Full-tendency mode (all questions)
 */

function getBufferedRequiredCount(percent, total, bufferFactor = 0.3) {
  return Math.ceil((percent / 100) * total * (1 + bufferFactor));
}

/**
 * Main Question Selection Function
 * @param {Array} allQuestions - All available questions [{id, question_text, tendency_ids}]
 * @param {Array} mapping - Selected tendencies with weights
 * @param {Number} totalCount - Target total question count
 * @param {Number} bufferFactor - Buffer factor for ratio mode
 * @param {Boolean} randomizeMode - true → old weighted logic, false → full-tendency mode
 */
function getQuestionsForAssessment(
  allQuestions,
  mapping,
  totalCount,
  bufferFactor = 0.3,
  randomizeMode = false // tied to assessment.randomize_questions
) {
  const questionsByTendency = {};

  // Build lookup table: tendency → [questions]
  for (const q of allQuestions) {
    for (const tId of q.tendency_ids) {
      if (!questionsByTendency[tId]) questionsByTendency[tId] = [];
      questionsByTendency[tId].push(q);
    }
  }

  // ============================================================
  // 🧩 MODE 1: FULL-TENDENCY MODE (Randomization OFF)
  // ============================================================
  if (!randomizeMode) {
    const selected = [];
    const added = new Set();

    for (const map of mapping) {
      const pool = questionsByTendency[map.tendency_id] || [];
      for (const q of pool) {
        if (!added.has(q.id)) {
          selected.push(q);
          added.add(q.id);
        }
      }
    }

    // Shuffle order (always random order, but same pool)
    for (let i = selected.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [selected[i], selected[j]] = [selected[j], selected[i]];
    }

    console.log(`✅ Full mode: ${selected.length} unique questions selected.`);
    return selected;
  }

  // ============================================================
  // 🧩 MODE 2: RATIO-BASED RANDOMIZATION (Randomization ON)
  // ============================================================
  const selected = [];

  for (const map of mapping) {
    const pool = questionsByTendency[map.tendency_id] || [];
    const weight = parseFloat(map.weightage_percentage);
    const count = getBufferedRequiredCount(weight, totalCount, bufferFactor);
    const shuffled = [...pool].sort(() => 0.5 - Math.random());
    selected.push(...shuffled.slice(0, count));
  }

  // Deduplicate
  const unique = [];
  const added = new Set();
  for (const q of selected) {
    if (!added.has(q.id)) {
      unique.push(q);
      added.add(q.id);
    }
  }

  // Shuffle again and trim
  for (let i = unique.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [unique[i], unique[j]] = [unique[j], unique[i]];
  }

  console.log(
    `🎲 Randomized mode: ${unique.length} unique questions selected (trimmed to ${totalCount}).`
  );
  return unique.slice(0, totalCount);
}

/**
 * Diagnostic utility: reports coverage per tendency
 */
function diagnoseTendencyCoverage(questions, mapping, totalCount, tendencyMap, bufferFactor = 0.3) {
  return mapping.map((map) => {
    const tid = map.tendency_id;
    const fallbackTendency = { name: tid, color: "#CCC" };
    const tendency = tendencyMap && tendencyMap[tid] ? tendencyMap[tid] : fallbackTendency;
    const available = questions.filter((q) => q.tendency_ids.includes(tid)).length;

    return {
      tendency_id: tid,
      name: tendency.name,
      color: tendency.color,
      available,
      required: available,
      hasGap: false,
    };
  });
}

window.getQuestionsForAssessment = getQuestionsForAssessment;
window.diagnoseTendencyCoverage = diagnoseTendencyCoverage;

