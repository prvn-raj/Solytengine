(() => {
  let assignmentId = null;
  let appUserId = null;
  let userAssessmentId = null;
  let currentQuestionIndex = 0;
  let questions = [];
  let questionStartTime = null; 

  async function initTakePage() {
    const urlParams = new URLSearchParams(window.location.search);
    assignmentId = urlParams.get("assignment_id");
    if (!assignmentId) {
      alert("Missing assignment ID");
      return;
    }

    const { data: sessionData } = await client.auth.getSession();
    const user = sessionData?.session?.user;
    if (!user) {
      alert("Session expired");
      window.location.href = "index.html";
      return;
    }

    const { data: profile, error: profileErr } = await client
      .from("app_users")
      .select("id")
      .eq("supabase_user_id", user.id)
      .single();

    if (profileErr || !profile) {
      alert("User profile not found");
      console.error("Profile error", profileErr);
      return;
    }

    appUserId = profile.id;

    // Check or create user_assessment
    const { data: ua } = await client
      .from("user_assessments")
      .select("id")
      .eq("assignment_id", assignmentId)
      .eq("app_user_id", appUserId)
      .single();

    if (ua) {
      userAssessmentId = ua.id;
    } else {
      const { data: assignmentMeta, error: metaErr } = await client
        .from("assessment_assignments")
        .select("assessment_id")
        .eq("id", assignmentId)
        .single();

      if (metaErr || !assignmentMeta) {
        alert("Assignment not found");
        console.error("Assignment fetch error:", metaErr);
        return;
      }

      const { data: inserted, error: insertErr } = await client
        .from("user_assessments")
        .insert({
          assignment_id: assignmentId,
          assessment_id: assignmentMeta.assessment_id,
          app_user_id: appUserId,
          status: "in_progress",
        })
        .select("id")
        .single();

      if (insertErr || !inserted) {
        alert("Failed to create assessment entry");
        console.error("Insert error:", insertErr);
        return;
      }

      userAssessmentId = inserted.id;
    }

    // Fetch assignment and assessment
    const { data: assignment, error: assignErr } = await client
      .from("assessment_assignments")
      .select("*, assessments(*)")
      .eq("id", assignmentId)
      .single();

    if (assignErr || !assignment) {
      alert("Assessment not found");
      return;
    }

    const assessment = assignment.assessments;
    const total = assessment.total_questions;

    const { data: mapping, error: mappingErr } = await client
      .from("assessment_tendency_weights")
      .select("*")
      .eq("assessment_id", assessment.id);

    if (mappingErr || !mapping?.length) {
      alert("No tendency mappings found for assessment");
      return;
    }

let timerInterval = null;

if (assessment.time_limit_minutes && assessment.time_limit_minutes > 0) {
  const durationMs = assessment.time_limit_minutes * 60 * 1000;
  const deadline = Date.now() + durationMs;

  const timerEl = document.getElementById("timer");
  updateTimer();

  timerInterval = setInterval(() => {
    updateTimer();
    if (Date.now() >= deadline) {
      clearInterval(timerInterval);
      alert("⏰ Time's up!");
      container.innerHTML = `<p class="completion-message">✅ Time over. Thank you for completing the assessment.</p>`;
      document.querySelector(".nav-buttons")?.remove();  // Optional: Disable nav
    }
  }, 1000);

  function updateTimer() {
    const remainingMs = deadline - Date.now();
    const mins = Math.floor(remainingMs / 60000);
    const secs = Math.floor((remainingMs % 60000) / 1000);
    timerEl.textContent = `⏱ ${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
}

    
    // Fetch questions with options from question_option_tendencies
    const { data: qraw, error: qErr } = await client
      .from("questions")
      .select("id, question_text, question_option_tendencies(option_value, tendency_id)");

    if (qErr || !qraw?.length) {
      alert("No questions available");
      return;
    }

 const allQuestions = qraw.map(q => {
  const uniqueOptions = [...new Set(q.question_option_tendencies?.map(o => o.option_value))];
  return {
    id: q.id,
    text: q.question_text,
    options: uniqueOptions,
    tendency_ids: q.question_option_tendencies?.map(o => o.tendency_id) || []
  };
});


    questions = getQuestionsForAssessment(allQuestions, mapping, total);

    if (!questions.length) {
      alert("No questions generated");
      return;
    }

    renderQuestion();
  }

async function renderQuestion() {
  const container = document.getElementById("question-container");
  const progress = document.getElementById("progress-bar");
  const qNumberLabel = document.getElementById("question-number-label");

  if (currentQuestionIndex >= questions.length) {
  // ✅ Mark assessment as completed
  await client
    .from("user_assessments")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", userAssessmentId);
    container.innerHTML = `
      <div class="completion-card">
        <p class="completion-message">✅ Assessment completed! Thank you.</p>
        <button class="nav-btn" onclick="window.location.href='user_dashboard.html'">🏠 Back to Dashboard</button>
      </div>
    `;
    progress.style.width = `100%`;
    if (qNumberLabel) qNumberLabel.textContent = `Completed`;

    // ✅ Mark assessment as completed in the DB
    await client
      .from("user_assessments")
      .update({
        status: "completed",
        completed_at: new Date().toISOString()
      })
      .eq("id", userAssessmentId);

    return;
  }

  const q = questions[currentQuestionIndex];

  // Update label and progress bar
  if (qNumberLabel) {
    qNumberLabel.textContent = `Question ${currentQuestionIndex + 1} of ${questions.length}`;
  }

  const progressPercent = ((currentQuestionIndex) / questions.length) * 100;
  progress.style.width = `${progressPercent}%`;

  // Render question
  container.innerHTML = `
    <div class="question-card">
      <h2>Q${currentQuestionIndex + 1} of ${questions.length}</h2>
      <p>${q.text}</p>
      <div class="options-container">
        ${(q.options || []).map(opt => `
          <label class="option-box">
            <input type="radio" name="option" value="${opt}" />
            <span>${opt}</span>
          </label>
        `).join("")}
      </div>
      <div class="nav-buttons">
        <button id="prev-btn" ${currentQuestionIndex === 0 ? "disabled" : ""}>Previous</button>
        <button id="next-btn">Next</button>
      </div>
    </div>
  `;

  questionStartTime = Date.now(); // Start timing
  preloadResponse(q.id); // Restore if answered before

  document.getElementById("next-btn").onclick = async () => {
    const selected = container.querySelector("input[name='option']:checked");
    const timeSpent = Math.floor((Date.now() - questionStartTime) / 1000);

    if (!selected) {
      alert("Please select an option");
      return;
    }

    await storeResponse(q.id, selected.value, timeSpent);
    currentQuestionIndex++;
    renderQuestion();
  };

  document.getElementById("prev-btn").onclick = async () => {
    const selected = container.querySelector("input[name='option']:checked");
    const timeSpent = Math.floor((Date.now() - questionStartTime) / 1000);

    if (selected) {
      await storeResponse(q.id, selected.value, timeSpent);
    }

    if (currentQuestionIndex > 0) {
      currentQuestionIndex--;
      renderQuestion();
    }
  };
}



async function preloadResponse(questionId) {
  try {
    const { data, error, status } = await client
      .from("user_responses")
      .select("response")
      .eq("user_assessment_id", userAssessmentId)
      .eq("question_id", questionId);

    if (error && status !== 406) {
      console.error("Supabase query error:", error.message);
      return;
    }

    if (data && data.length > 0 && data[0].response?.selected) {
      const selected = data[0].response.selected;
      const input = document.querySelector(`input[name='option'][value="${selected}"]`);
      if (input) input.checked = true;
    }
  } catch (err) {
    console.warn("Handled fetch error (possibly 406):", err.message);
  }
}


async function storeResponse(questionId, selectedOption, timeSpentSeconds = null) {
  const responseData = {
    user_assessment_id: userAssessmentId,
    question_id: questionId,
    response: { selected: selectedOption },
  };

  // Only include time if it's provided
  if (timeSpentSeconds !== null) {
    responseData.time_spent_seconds = timeSpentSeconds;
  }

  const { error } = await client
    .from("user_responses")
    .upsert(responseData, { onConflict: ['user_assessment_id', 'question_id'] });

  if (error) {
    console.error("❌ Failed to store response:", error);
  }
}




  window.addEventListener("DOMContentLoaded", initTakePage);
})();
