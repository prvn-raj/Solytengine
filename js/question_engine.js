function getBufferedRequiredCount(percent, total, bufferFactor = 0.3) {
  return Math.ceil((percent / 100) * total * (1 + bufferFactor));
}

function getQuestionsForAssessment(allQuestions, mapping, totalCount, bufferFactor = 0.3) {
  const questionsByTendency = {};
  const seen = new Set();

  for (const q of allQuestions) {
    for (const tId of q.tendency_ids) {
      if (!questionsByTendency[tId]) questionsByTendency[tId] = [];
      questionsByTendency[tId].push(q);
    }
  }

  const selected = [];
  for (const map of mapping) {
    const pool = questionsByTendency[map.tendency_id] || [];
    const weight = parseFloat(map.weightage_percentage);
    const count = getBufferedRequiredCount(weight, totalCount, bufferFactor);
    const shuffled = [...pool].sort(() => 0.5 - Math.random());
    selected.push(...shuffled.slice(0, count));
  }

  const unique = [];
  const added = new Set();
  for (const q of selected) {
    if (!added.has(q.id)) {
      unique.push(q);
      added.add(q.id);
    }
  }

  return unique.slice(0, totalCount);
}

function diagnoseTendencyCoverage(questions, mapping, totalCount, tendencyMap, bufferFactor = 0.3) {
  return mapping.map(map => {
    const tid = map.tendency_id;
    const fallbackTendency = { name: tid, color: "#CCC" };
    const tendency = tendencyMap && tendencyMap[tid] ? tendencyMap[tid] : fallbackTendency;

    const baseRequired = (parseFloat(map.weightage_percentage) / 100) * totalCount;
    const bufferedRequired = getBufferedRequiredCount(map.weightage_percentage, totalCount, bufferFactor);
    const available = questions.filter(q => q.tendency_ids.includes(tid)).length;

    return {
      tendency_id: tid,
      name: tendency.name,
      color: tendency.color,
      available,
      bufferedRequired,
      originalPercent: parseFloat(map.weightage_percentage),
      hasGap: available < bufferedRequired
    };
  });
}

