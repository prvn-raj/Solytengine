
(() => {
  let userId = null;
  let appUserId = null;

  async function initUserDashboard() {
    const formSection = document.getElementById("password-change-section");
    const assessmentsSection = document.getElementById("assigned-assessments");
    const statusMsg = document.getElementById("password-change-status");

    // Hide initially
    formSection.classList.add("hidden");
    assessmentsSection.classList.add("hidden");

    const userRes = await client.auth.getUser();
    const user = userRes.data.user;
    if (!user) {
      window.location.href = "index.html";
      return;
    }
    userId = user.id;

    const { data: profile, error } = await client
      .from("app_users")
      .select("id, initial_password, first_name, last_name")
      .eq("supabase_user_id", userId)
      .single();

    if (error || !profile) {
      statusMsg.textContent = "❌ Error loading profile.";
      statusMsg.classList.remove("hidden");
      statusMsg.classList.add("text-red-600");
      return;
    }

    const fullName = `${profile.first_name} ${profile.last_name}`;
    const welcomeEl = document.getElementById("welcome-user");
    if (welcomeEl) welcomeEl.textContent = `👋 Welcome, ${fullName}`;
    appUserId = profile.id;

    if (profile.initial_password) {
      formSection.classList.remove("hidden");
    } else {
      assessmentsSection.classList.remove("hidden");
      await loadAssignedAssessments(appUserId);
    }
  }

  async function loadAssignedAssessments(appUserId) {
    const container = document.getElementById("assessment-list");
    container.innerHTML = "⏳ Loading assessments...";

    const { data: cohortMemberships, error: cohortErr } = await client
      .from("cohort_members")
      .select("cohort_id")
      .eq("app_user_id", appUserId);

    if (cohortErr) {
      container.innerHTML = "❌ Failed to load cohort memberships.";
      console.error(cohortErr);
      return;
    }

    const cohortIds = cohortMemberships?.map((c) => c.cohort_id) || [];

    const { data: cohortAssignments, error: cohortAssignErr } = await client
      .from("assessment_assignments")
      .select("*, assessments(*), cohorts(name)")
      .in("cohort_id", cohortIds);

    const { data: individualAssignments, error: individualAssignErr } = await client
      .from("assessment_assignments")
      .select("*, assessments(*), cohorts(name)")
      .eq("app_user_id", appUserId);

    if (cohortAssignErr || individualAssignErr) {
      container.innerHTML = "❌ Failed to load assessments.";
      console.error(cohortAssignErr || individualAssignErr);
      return;
    }

    const assignments = [...(individualAssignments || []), ...(cohortAssignments || [])];

    const { data: userAssessments } = await client
      .from("user_assessments")
      .select("assignment_id, status")
      .eq("app_user_id", appUserId);

    const statusMap = {};
    const attemptCountMap = {};

    userAssessments?.forEach((a) => {
      attemptCountMap[a.assignment_id] = (attemptCountMap[a.assignment_id] || 0) + 1;
      if (!statusMap[a.assignment_id]) {
        statusMap[a.assignment_id] = a.status;
      } else {
        const current = statusMap[a.assignment_id];
        const priority = { completed: 3, in_progress: 2, not_started: 1 };
        if (priority[a.status] > priority[current]) {
          statusMap[a.assignment_id] = a.status;
        }
      }
    });

    container.innerHTML = "";
    if (assignments.length === 0) {
      container.innerHTML = `<p class="info">❌ No assessments available.</p>`;
      return;
    }

    const grouped = {};
    for (const a of assignments) {
      const key = a.assignment_type === "cohort"
        ? `Cohort: ${a.cohorts?.name || "Unnamed"}`
        : "Individual";
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

        const title = assignment.assessments?.name || "Untitled Assessment";
        const totalQuestions = assignment.assessments?.total_questions ?? "?";
        const status = statusMap[assignment.id] || "not_started";
        const attemptsUsed = attemptCountMap[assignment.id] || 0;
        const maxAttempts = assignment.max_attempts ?? "∞";

        let badgeClass = "status-not-started";
        if (status === "in_progress") badgeClass = "status-in-progress";
        if (status === "completed") badgeClass = "status-completed";

        info.innerHTML = `
          <h4>
            ${title}
            <span class="status-badge ${badgeClass}">
              ${status.replace("_", " ")}
            </span>
          </h4>
          <p>
            🧪 Attempts: ${attemptsUsed} / ${maxAttempts} |
            ❓ Questions: ${totalQuestions} |
            📅 Due: ${assignment.end_date ?? "N/A"} |
            ⏱ Time Limit: ${assignment.time_limit_minutes ? `${assignment.time_limit_minutes} mins` : "N/A"}
          </p>
        `;

        const btn = document.createElement("button");
        btn.className = "start-btn";
        btn.textContent = status === "in_progress" ? "▶️ Resume" : "🚀 Start";

        const noAttemptsLeft = maxAttempts !== "∞" && attemptsUsed >= maxAttempts;
        const isCompleted = status === "completed";
        const isExpired = assignment.end_date && new Date(assignment.end_date) < new Date().setHours(0, 0, 0, 0);

        if (isCompleted) {
          btn.disabled = true;
          btn.textContent = "✅ Completed";
          btn.classList.add("disabled-btn");
          btn.setAttribute("data-tooltip", "You have already completed this assessment.");
        } else if (noAttemptsLeft) {
          btn.disabled = true;
          btn.textContent = "🚫 No Attempts";
          btn.classList.add("disabled-btn");
          btn.setAttribute("data-tooltip", "No attempts left for this assessment.");
        } else if (isExpired) {
          btn.disabled = true;
          btn.textContent = "⌛ Expired";
          btn.classList.add("disabled-btn");
          btn.setAttribute("data-tooltip", "This assessment has expired.");
        } else {
          btn.onclick = async () => {
            const { count } = await client
              .from("user_assessments")
              .select("*", { count: "exact", head: true })
              .eq("assignment_id", assignment.id)
              .eq("app_user_id", appUserId);

            const { data: assignmentMeta } = await client
              .from("assessment_assignments")
              .select("max_attempts")
              .eq("id", assignment.id)
              .single();

            const max = assignmentMeta?.max_attempts ?? 1;

            if (count >= max) {
              alert("❌ No attempts left for this assessment.");
              return;
            }

            window.location.href = `user_take.html?assignment_id=${assignment.id}`;
          };
        }

        card.appendChild(info);
        card.appendChild(btn);
        block.appendChild(card);
      }

      container.appendChild(block);
    }
  }

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
    await client
      .from("app_users")
      .update({ initial_password: null })
      .eq("supabase_user_id", user.id);

    statusMsg.textContent = "✅ Password updated. Redirecting to login...";
    statusMsg.classList.remove("text-red-600");
    statusMsg.classList.add("text-green-600");
    statusMsg.classList.remove("hidden");

    setTimeout(async () => {
      await client.auth.signOut();
      window.location.href = "index.html";
    }, 2000);
  });

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
          container.innerHTML = `<p style="color: red;">Failed to load profile page.</p>`;
          console.error(err);
        }
      }
      else if (section === "reports") {
  alert("📢 Reachout to Admin!");
}

    });
  });

  document.getElementById("logout-btn")?.addEventListener("click", async () => {
    const { error } = await client.auth.signOut();
    if (!error) window.location.href = "index.html";
  });

  initUserDashboard();
})();
