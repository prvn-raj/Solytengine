(() => {
  let userId = null;
  let appUserId = null;

  async function initUserDashboard() {
    const formSection = document.getElementById("password-change-section");
    const assessmentsSection = document.getElementById("assigned-assessments");
    const statusMsg = document.getElementById("password-change-status");

    // Hide initially
    if (formSection) formSection.classList.add("hidden");
    if (assessmentsSection) assessmentsSection.classList.add("hidden");

    // Session
    const userRes = await client.auth.getUser();
    const user = userRes.data.user;
    if (!user) {
      window.location.href = "index.html";
      return;
    }
    userId = user.id;

    // app_users profile
    const { data: profile, error } = await client
      .from("app_users")
      .select("id, initial_password, first_name, last_name")
      .eq("supabase_user_id", userId)
      .single();

    if (error || !profile) {
      if (statusMsg) {
        statusMsg.textContent = "❌ Error loading profile.";
        statusMsg.classList.remove("hidden");
        statusMsg.classList.add("text-red-600");
      }
      return;
    }

    appUserId = profile.id;

    const fullName = `${profile.first_name || ""} ${profile.last_name || ""}`.trim();
    const welcomeEl = document.getElementById("welcome-user");
    if (welcomeEl) welcomeEl.textContent = fullName ? `👋 Welcome, ${fullName}` : "👋 Welcome";

    // If first login (initial password present) → show change password
    if (profile.initial_password) {
      if (formSection) formSection.classList.remove("hidden");
    } else {
      if (assessmentsSection) assessmentsSection.classList.remove("hidden");
      await loadAssignedAssessments(appUserId);
    }
  }

  function fmtDate(dateStr) {
    if (!dateStr) return "N/A";
    try {
      const d = new Date(dateStr);
      if (Number.isNaN(+d)) return "N/A";
      return d.toLocaleDateString();
    } catch {
      return "N/A";
    }
  }

  function isExpiredByEndDate(endDateStr) {
    if (!endDateStr) return false;
    const today = new Date(); today.setHours(0,0,0,0);
    const end = new Date(endDateStr); end.setHours(0,0,0,0);
    return end.getTime() < today.getTime();
  }

  async function loadAssignedAssessments(appUserId) {
    const container = document.getElementById("assessment-list");
    if (!container) return;
    container.innerHTML = "⏳ Loading assessments...";

    // 1) user's cohort memberships
    const { data: cohortMemberships, error: cohortErr } = await client
      .from("cohort_members")
      .select("cohort_id")
      .eq("app_user_id", appUserId);

    if (cohortErr) {
      container.innerHTML = "❌ Failed to load cohort memberships.";
      console.error(cohortErr);
      return;
    }

    const cohortIds = (cohortMemberships || []).map((c) => c.cohort_id);

    // 2) assignments (cohort + individual) with the assessment join
    const selectFields =
      "id, assignment_type, cohort_id, app_user_id, assessment_id, end_date, max_attempts, " +
      "assessments(id, name, total_questions, time_limit_minutes), " +
      "cohorts(name)";

    const [{ data: cohortAssignments, error: cohortAssignErr }, { data: individualAssignments, error: individualAssignErr }] =
      await Promise.all([
        cohortIds.length
          ? client.from("assessment_assignments").select(selectFields).in("cohort_id", cohortIds)
          : Promise.resolve({ data: [], error: null }),
        client.from("assessment_assignments").select(selectFields).eq("app_user_id", appUserId)
      ]);

    if (cohortAssignErr || individualAssignErr) {
      container.innerHTML = "❌ Failed to load assessments.";
      console.error(cohortAssignErr || individualAssignErr);
      return;
    }

    const assignments = [...(individualAssignments || []), ...(cohortAssignments || [])];

    // 3) aggregate attempts + latest status per assignment
    const { data: userAssessments, error: uaErr } = await client
      .from("user_assessments")
      .select("assignment_id, status, completed_at, current_question_index, created_at, updated_at")
      .eq("app_user_id", appUserId);

    if (uaErr) {
      container.innerHTML = "❌ Failed to load assessment attempts.";
      console.error(uaErr);
      return;
    }

    const statusPriority = { not_started: 1, in_progress: 2, completed: 3 };
    const statusMap = {};
    const completedCountMap = {};
    const startedCountMap = {}; // in_progress + completed
    const latestByAssignment = {}; // keep the latest UA row (by updated_at, fallback created_at)

    (userAssessments || []).forEach((ua) => {
      // count started attempts
      if (ua.status === "in_progress" || ua.status === "completed") {
        startedCountMap[ua.assignment_id] = (startedCountMap[ua.assignment_id] || 0) + 1;
      }
      if (ua.status === "completed") {
        completedCountMap[ua.assignment_id] = (completedCountMap[ua.assignment_id] || 0) + 1;
      }
      // most-advanced status
      const prev = statusMap[ua.assignment_id] || "not_started";
      if (statusPriority[ua.status] >= statusPriority[prev]) {
        statusMap[ua.assignment_id] = ua.status;
      }
      // track latest row
      const prevLatest = latestByAssignment[ua.assignment_id];
      const curTs = new Date(ua.updated_at || ua.created_at || 0).getTime();
      const prevTs = prevLatest ? new Date(prevLatest.updated_at || prevLatest.created_at || 0).getTime() : -1;
      if (!prevLatest || curTs >= prevTs) {
        latestByAssignment[ua.assignment_id] = ua;
      }
    });

    // 4) render
    container.innerHTML = "";
    if (assignments.length === 0) {
      container.innerHTML = `<p class="info">❌ No assessments available.</p>`;
      return;
    }

    // group by Individual / Cohort
    const grouped = {};
    for (const a of assignments) {
      const key = a.assignment_type === "cohort" ? `Cohort: ${a.cohorts?.name || "Unnamed"}` : "Individual";
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(a);
    }

    for (const group in grouped) {
      const block = document.createElement("div");
      block.className = "assessment-group";

      const groupHeader = document.createElement("h3");
      groupHeader.textContent = group;
      block.appendChild(groupHeader);

      for (const assignment of grouped[group]) {
        const card = document.createElement("div");
        card.className = "assessment-card";

        const info = document.createElement("div");
        info.className = "assessment-info";

        const asmt = assignment.assessments || {};
        const title = asmt.name || "Untitled Assessment";
        const totalQuestions = asmt.total_questions ?? "—";

        // TIME LIMIT: from joined assessments row
        const timeLimitMinutes = Number.isFinite(asmt.time_limit_minutes) ? asmt.time_limit_minutes : null;
        const timeLimitLabel = timeLimitMinutes && timeLimitMinutes > 0 ? `${timeLimitMinutes} mins` : "No limit";

        const status = statusMap[assignment.id] || "not_started";
        const latest = latestByAssignment[assignment.id];
        const attemptsUsed = startedCountMap[assignment.id] || 0;
        const maxAttempts = Number.isFinite(assignment.max_attempts) ? assignment.max_attempts : 1;
        const expired = isExpiredByEndDate(assignment.end_date);

        // ---- Minimal change: compute a display label that treats “graceful exit” as EXITED
        let displayStatus = status;
        if (status === "completed" && latest) {
          const latestIdx = typeof latest.current_question_index === "number" ? latest.current_question_index : null;
          const tq = Number.isFinite(asmt.total_questions) ? asmt.total_questions : null;
          // If user didn't reach the end, and they still have attempts left -> show "exited"
          if (tq !== null && latestIdx !== null && latestIdx < tq && attemptsUsed < (maxAttempts || 1)) {
            displayStatus = "exited";
          }
        }
        if (displayStatus === "exited") {
  displayStatus = "in progress";
}
 if (attemptsUsed >= maxAttempts) {
    displayStatus = "attempts_exhausted";
  }
        let badgeClass = "status-not-started";
        if (displayStatus === "in progress") badgeClass = "status-in-progress";
        if (displayStatus === "completed") badgeClass = "status-completed";
        if (displayStatus === "attempts_exhausted") badgeClass = "status-exhausted";
        //if (displayStatus === "exited") badgeClass = "status-in-progress"; // style like in-progress for visibility

        // render
        info.innerHTML = `
          <h4>
            ${title}
            <span class="status-badge ${badgeClass}">
              ${displayStatus.replace("_", " ")}
            </span>
          </h4>
          <p>
            🧪 Attempts: ${attemptsUsed} / ${maxAttempts} |
            ❓ Questions: ${totalQuestions} |
            📅 Due: ${fmtDate(assignment.end_date)} |
            ⏱ Time Limit: ${timeLimitLabel}
          </p>
        `;

        const btn = document.createElement("button");
        btn.className = "start-btn";

        // button state rules (unchanged except we don't disable on completed if attempts remain)
        if (expired) {
          btn.disabled = true;
          btn.textContent = "⌛ Expired";
          btn.classList.add("disabled-btn");
          btn.setAttribute("data-tooltip", "This assessment has expired.");
        } else if (maxAttempts && attemptsUsed >= maxAttempts) {
          btn.disabled = true;
          btn.textContent = "🚫 No Attempts";
          btn.classList.add("disabled-btn");
          btn.setAttribute("data-tooltip", "No attempts left for this assessment.");
        } else if ((statusMap[assignment.id] || "not_started") === "in_progress") {
          btn.textContent = "▶️ Resume";
          btn.onclick = async () => {
            // find latest in-progress UA to deep-link directly to Take
            const { data: ua } = await client
              .from("user_assessments")
              .select("id")
              .eq("assignment_id", assignment.id)
              .eq("app_user_id", appUserId)
              .eq("status", "in_progress")
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            const target = ua?.id
              ? `user_take.html?assignment_id=${encodeURIComponent(assignment.id)}&user_assessment_id=${encodeURIComponent(ua.id)}`
              : `assessment_prep.html?assignment_id=${encodeURIComponent(assignment.id)}`;

            window.location.href = target;
          };
        } else {
          btn.textContent = "🚀 Start";
          btn.onclick = async () => {
            const started = attemptsUsed;
            const max = Number.isFinite(assignment.max_attempts) ? assignment.max_attempts : 1;
            if (max && started >= max) {
              alert("❌ No attempts left for this assessment.");
              return;
            }
            window.location.href = `assessment_prep.html?assignment_id=${encodeURIComponent(assignment.id)}`;
          };
        }

        card.appendChild(info);
        card.appendChild(btn);
        block.appendChild(card);
      }

      container.appendChild(block);
    }
  }

  // password change flow
  document.getElementById("change-password-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const newPassword = document.getElementById("new-password").value;
    const statusMsg = document.getElementById("password-change-status");

    const { error: authError } = await client.auth.updateUser({ password: newPassword });
    if (authError) {
      statusMsg.textContent = `❌ ${authError.message}`;
      statusMsg.classList.remove("hidden", "text-green-600");
      statusMsg.classList.add("text-red-600");
      return;
    }

    const user = (await client.auth.getUser()).data.user;
    await client.from("app_users").update({ initial_password: null }).eq("supabase_user_id", user.id);

    statusMsg.textContent = "✅ Password updated. Redirecting to login...";
    statusMsg.classList.remove("text-red-600");
    statusMsg.classList.add("text-green-600");
    statusMsg.classList.remove("hidden");

    setTimeout(async () => {
      await client.auth.signOut();
      window.location.href = "index.html";
    }, 2000);
  });

  // sidebar nav
  document.querySelectorAll(".sidebar .nav a").forEach((link) => {
    link.addEventListener("click", async (e) => {
      e.preventDefault();

      document.querySelectorAll(".sidebar .nav a").forEach((l) => l.classList.remove("active"));
      link.classList.add("active");

      document.querySelectorAll("main > section").forEach((sec) => sec.classList.add("hidden"));

      const welcomeMsg = document.getElementById("welcome-user");
      const subtitle = document.querySelector(".subtitle");

      const section = link.dataset.section;
      if (section === "assessments") {
        const profileContainer = document.getElementById("user-dashboard-content");
        if (profileContainer) profileContainer.innerHTML = "";

        document.getElementById("assigned-assessments")?.classList.remove("hidden");
        if (appUserId) await loadAssignedAssessments(appUserId);

        if (welcomeMsg) welcomeMsg.classList.remove("hidden");
        if (subtitle) subtitle.classList.remove("hidden");
      } else if (section === "profile") {
        const container = document.getElementById("user-dashboard-content");
        if (!container) return;

        if (welcomeMsg) welcomeMsg.classList.add("hidden");
        if (subtitle) subtitle.classList.add("hidden");

        try {
          const res = await fetch("/user_profile.html");
          const html = await res.text();
          const temp = document.createElement("div");
          temp.innerHTML = html;

          const innerContent = temp.querySelector(".page-content");
          container.innerHTML = "";
          container.appendChild(innerContent || temp);

          const existingCss = document.getElementById("dynamic-css");
          if (existingCss) existingCss.remove();

          const css = document.createElement("link");
          css.rel = "stylesheet";
          css.href = "/css/user_profile.css";
          css.id = "dynamic-css";
          document.head.appendChild(css);

          const oldScript = document.getElementById("dynamic-script-loader");
          if (oldScript) oldScript.remove();

          const script = document.createElement("script");
          script.src = "/js/user_profile.js";
          script.id = "dynamic-script-loader";
          script.onload = () => console.log("✅ Profile script loaded and executed");
          document.body.appendChild(script);
        } catch (err) {
          const container = document.getElementById("user-dashboard-content");
          if (container) container.innerHTML = `<p style="color: red;">Failed to load profile page.</p>`;
          console.error(err);
        }
      } else if (section === "reports") {
        alert("📢 Reachout to Admin!");
      }
    });
  });

  // logout
  document.getElementById("logout-btn")?.addEventListener("click", async () => {
    const { error } = await client.auth.signOut();
    if (!error) window.location.href = "index.html";
  });

  initUserDashboard();
})();
