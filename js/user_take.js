(() => {
  let assignmentId = null;
  let userAssessmentId = null;
  let appUserId = null;

  let currentQuestionIndex = 0;
  let questions = [];
  let questionStartTime = null;
  let timerInterval = null;

  async function initTakePage() {
    const url = new URLSearchParams(window.location.search);
    assignmentId = url.get("assignment_id");
    const uaFromUrl = url.get("user_assessment_id");

    if (!assignmentId) {
      alert("Missing assignment ID");
      return;
    }

    // Ensure session
    const { data: sessionData } = await client.auth.getSession();
    const user = sessionData?.session?.user;
    if (!user) {
      alert("Session expired");
      window.location.href = "index.html";
      return;
    }

    // Resolve app_user_id
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

    // Use UA from URL if valid; otherwise, find/create one
    if (uaFromUrl) {
      const { data: existing, error: checkErr } = await client
        .from("user_assessments")
        .select("id, assignment_id, app_user_id")
        .eq("id", uaFromUrl)
        .maybeSingle();

      if (checkErr) {
        console.error(checkErr);
        alert("Failed to validate assessment session.");
        return;
      }
      if (!existing || existing.assignment_id !== assignmentId || existing.app_user_id !== appUserId) {
        alert("This assessment link is not valid for your account.");
        return;
      }
      userAssessmentId = existing.id;
    } else {
      // find an in-progress UA or create a fresh one (fallback preserved)
      const { data: found } = await client
        .from("user_assessments")
        .select("id")
        .eq("assignment_id", assignmentId)
        .eq("app_user_id", appUserId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (found?.id) {
        userAssessmentId = found.id;
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
    }

    // Fetch assignment with embedded assessment
    const { data: assignment, error: assignErr } = await client
      .from("assessment_assignments")
      .select("*, assessments(*)")
      .eq("id", assignmentId)
      .single();

    if (assignErr || !assignment || !assignment.assessments) {
      alert("Assessment not found");
      return;
    }
    const assessment = assignment.assessments;

    // Start/Show timer if needed (✅ unhide + write to #countdown)
    setupTimer(assessment.time_limit_minutes);

    // Pull mapping to select questions
    const { data: mapping, error: mappingErr } = await client
      .from("assessment_tendency_weights")
      .select("*")
      .eq("assessment_id", assessment.id);

    if (mappingErr || !mapping?.length) {
      alert("No tendency mappings found for assessment");
      return;
    }

    // Fetch question pool (options via question_option_tendencies)
    const { data: qraw, error: qErr } = await client
      .from("questions")
      .select("id, question_text, question_option_tendencies(option_value, tendency_id)");

    if (qErr || !qraw?.length) {
      alert("No questions available");
      return;
    }

    const allQuestions = qraw.map((q) => {
      const uniqueOptions = [...new Set(q.question_option_tendencies?.map((o) => o.option_value))];
      return {
        id: q.id,
        text: q.question_text,
        options: uniqueOptions,
        tendency_ids: q.question_option_tendencies?.map((o) => o.tendency_id) || [],
      };
    });

    const total = assessment.total_questions;
    questions = getQuestionsForAssessment(allQuestions, mapping, total);
    if (!questions.length) {
      alert("No questions generated");
      return;
    }

    // Best-effort finalize on tab close / navigation away (abandon)
    window.addEventListener("pagehide", handleAbandon, { passive: true });
    window.addEventListener("beforeunload", handleAbandon, { passive: true });

    renderQuestion();
  }

  function setupTimer(timeLimitMinutes) {
    const timerWrap = document.getElementById("timer");
    const countdownEl = document.getElementById("countdown");
    if (!timeLimitMinutes || timeLimitMinutes <= 0 || !timerWrap || !countdownEl) return;

    // ✅ unhide and start writing to #countdown
    timerWrap.classList.remove("hidden");
    const deadline = Date.now() + timeLimitMinutes * 60 * 1000;

    const update = () => {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) {
        clearInterval(timerInterval);
        countdownEl.textContent = "00:00";
        completeAndExit("⏰ Time's up!");
        return;
      }
      const mins = Math.floor(remainingMs / 60000);
      const secs = Math.floor((remainingMs % 60000) / 1000);
      countdownEl.textContent = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    };

    update();
    timerInterval = setInterval(update, 1000);
  }

  async function renderQuestion() {
    const container = document.getElementById("question-container");
    const progress = document.getElementById("progress-bar");
    const qNumberLabel = document.getElementById("question-number-label");

    // ✅ avoid undefined container
    if (!container) {
      console.error("Missing #question-container in DOM");
      return;
    }

    // Completed
    if (currentQuestionIndex >= questions.length) {
      // ✅ remove duplicate completion write; delegate to completeAndExit
      if (timerInterval) clearInterval(timerInterval);
      await completeAndExit("✅ Assessment completed! Thank you.");
      if (progress) progress.style.width = `100%`;
      if (qNumberLabel) qNumberLabel.textContent = `Completed`;
      return;
    }

    const q = questions[currentQuestionIndex];

    if (qNumberLabel) {
      qNumberLabel.textContent = `Question ${currentQuestionIndex + 1} of ${questions.length}`;
    }
    if (progress) {
      const pct = (currentQuestionIndex / questions.length) * 100;
      progress.style.width = `${pct}%`;
    }

    container.innerHTML = `
  <div class="question-card">
    <h2>Q${currentQuestionIndex + 1} of ${questions.length}</h2>
    <p>${q.text}</p>
    <div class="options-container">
      ${(q.options || [])
        .map(
          (opt) => `
        <label class="option-box">
          <input type="radio" name="option" value="${opt}" />
          <span>${opt}</span>
        </label>`
        )
        .join("")}
    </div>
    <div class="nav-buttons">
      <button id="exit-btn" class="secondary">↩ Exit</button>
      <div class="spacer"></div>
      <button id="prev-btn" ${currentQuestionIndex === 0 ? "disabled" : ""}>Previous</button>
      <button id="next-btn">Next</button>
    </div>
  </div>
`;

    questionStartTime = Date.now();
    await preloadResponse(q.id);

    document.getElementById("next-btn").onclick = async () => {
      const selected = container.querySelector("input[name='option']:checked");
      const timeSpent = Math.floor((Date.now() - questionStartTime) / 1000);
      if (!selected) {
        alert("Please select an option");
        return;
      }
      await storeResponse(q.id, selected.value, timeSpent);
      currentQuestionIndex++;
      await updateProgress();   // ✅ track progress
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
        await updateProgress();   // ✅ track progress
        renderQuestion();
      }
    };

    // ✅ Exit now finalizes the attempt so attempts increment
    document.getElementById("exit-btn").onclick = async () => {
  const confirmExit = confirm("Exit to dashboard? Your answers are saved and you can start a new attempt later.");
  if (!confirmExit) return;

  const selected = container.querySelector("input[name='option']:checked");
  const timeSpent = Math.floor((Date.now() - questionStartTime) / 1000);
  if (selected) {
    await storeResponse(q.id, selected.value, timeSpent);
  }

  if (timerInterval) clearInterval(timerInterval);

  try {
    await client
      .from("user_assessments")
      .update({
        status: "in_progress",   // ✅ keep as in_progress
        updated_at: new Date().toISOString(),
      })
      .eq("id", userAssessmentId);
  } catch (e) {
    console.warn("Exit update failed", e);
  } finally {
    window.location.href = "user_dashboard.html";
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
    const row = {
      user_assessment_id: userAssessmentId,
      question_id: questionId,
      response: { selected: selectedOption },
    };
    if (timeSpentSeconds !== null) row.time_spent_seconds = timeSpentSeconds;

    const { error } = await client
      .from("user_responses")
      .upsert(row, { onConflict: ["user_assessment_id", "question_id"] });

    if (error) console.error("❌ Failed to store response:", error);
  }

  async function completeAndExit(messageText) {
    try {
      await client
        .from("user_assessments")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", userAssessmentId);
    } catch (e) {
      /* best effort */
    }
    const container = document.getElementById("question-container");
    if (container) {
      container.innerHTML = `
        <div class="completion-card">
          <p class="completion-message">${messageText || "✅ Assessment completed."}</p>
          <button class="nav-btn" onclick="window.location.href='user_dashboard.html'">🏠 Back to Dashboard</button>
        </div>
      `;
    }
  }

  // Best-effort finalize when page is being closed / navigated away
 async function handleAbandon() {
  if (!userAssessmentId) return;
  try {
    // Fetch current status before overwriting
    const { data: ua } = await client
      .from("user_assessments")
      .select("status")
      .eq("id", userAssessmentId)
      .single();

    if (ua?.status !== "completed") {
      await client
        .from("user_assessments")
        .update({
          status: "in_progress",
          updated_at: new Date().toISOString(),
        })
        .eq("id", userAssessmentId);
    }
  } catch (e) {
    console.warn("⚠️ handleAbandon failed", e.message);
  }
}



async function updateProgress() {
  try {
    await client
      .from("user_assessments")
      .update({ current_question_index: currentQuestionIndex })
      .eq("id", userAssessmentId);
  } catch (e) {
    console.warn("⚠️ Failed to update progress index:", e.message);
  }
}


  window.addEventListener("DOMContentLoaded", initTakePage);
})();
