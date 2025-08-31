// reports.js
(async () => {
  const assignmentBody = document.getElementById("assignment-summary-body");
  const completedBody = document.getElementById("completed-summary-body");
  const responseBody = document.getElementById("response-detail-body");
  const exportBtn = document.getElementById("export-btn");
  const exportResponseBtn = document.getElementById("export-response-btn");

  // 📌 Assignments (same as before)
  const { data: assignments, error: assignErr } = await client
    .from("assessment_assignments")
    .select("*, assessments(name), app_users(first_name, last_name, user_id), cohorts(name), user_assessments(status)");

  if (assignErr) console.error("❌ Error loading assignments:", assignErr);
  renderAssignmentSummary(assignments || []);

  // 📌 Step 1: Get completed assessments
  const { data: completions, error: compErr } = await client
    .from("user_assessments")
    .select("id, app_user_id, assessment_id, status, attempt_number, completed_at")
    .in("status", ["completed"]) 
    .order("completed_at", { ascending: false });
    console.log("DEBUG completions:", completions, compErr);

  if (compErr) console.error("❌ Error loading completions:", compErr);

  // 📌 Step 2: Collect unique user + assessment IDs
  const userIds = [...new Set((completions || []).map(c => c.app_user_id))];
  const assessmentIds = [...new Set((completions || []).map(c => c.assessment_id))];

  // 📌 Step 3: Fetch users + assessments in parallel
  const [{ data: users }, { data: assessmentsMap }] = await Promise.all([
    client.from("app_users").select("id, user_id, first_name, last_name").in("id", userIds),
    client.from("assessments").select("id, name").in("id", assessmentIds)
  ]);

  const userMap = Object.fromEntries((users || []).map(u => [u.id, u]));
  const assessMap = Object.fromEntries((assessmentsMap || []).map(a => [a.id, a]));

  // 📌 Step 4: Merge back into completions
  const enrichedCompletions = (completions || []).map(c => ({
    ...c,
    app_users: userMap[c.app_user_id] || null,
    assessments: assessMap[c.assessment_id] || null
  }));

  renderCompletedAssessments(enrichedCompletions);

  // 📌 Export all responses
  exportBtn?.addEventListener("click", async () => {
    const { data: responses, error } = await client.from("user_response_summary").select("*");
    if (error) {
      console.error("❌ Export error:", error);
      return;
    }
    exportToCSV(responses);
  });

  exportResponseBtn?.addEventListener("click", exportResponseDetailsToCSV);

  // -------------------------------
  // 📊 RENDER FUNCTIONS
  // -------------------------------
  function renderAssignmentSummary(data) {
    assignmentBody.innerHTML = "";
    if (!data || data.length === 0) {
      assignmentBody.innerHTML = "<tr><td colspan='7'>No assignments found</td></tr>";
      return;
    }

    data.forEach(row => {
      const type = row.assignment_type;
      const target = row.app_user_id
        ? `${row.app_users?.first_name || ""} ${row.app_users?.last_name || ""}`
        : row.cohorts?.name || "-";

      const totalUsers = row.app_user_id ? 1 : row.cohort_id ? "👥" : "-";
      const completed = Array.isArray(row.user_assessments)
        ? row.user_assessments.filter(u => u.status === "completed").length
        : 0;

      const progress = row.app_user_id ? (completed ? "✅" : "⏳") : "-";

      assignmentBody.innerHTML += `
        <tr>
          <td>${type}</td>
          <td>${row.assessments?.name || "-"}</td>
          <td>${target}</td>
          <td>${totalUsers}</td>
          <td>${completed}</td>
          <td>${progress}</td>
          <td>${completed ? "Report Ready" : "Pending"}</td>
        </tr>`;
    });
  }

  function renderCompletedAssessments(data) {
    completedBody.innerHTML = "";

    if (!data || data.length === 0) {
      completedBody.innerHTML = "<tr><td colspan='5'>No completed assessments found</td></tr>";
      return;
    }

    data.forEach(row => {
      const user = `${row.app_users?.first_name || ""} ${row.app_users?.last_name || ""}`;
      const userId = row.app_users?.user_id || "-";
      const assessmentName = row.assessments?.name || "-";
      const attemptNumber = row.attempt_number || 1;

      completedBody.innerHTML += `
        <tr>
          <td>${user}</td>
          <td>${assessmentName}</td>
          <td>${row.completed_at ? new Date(row.completed_at).toLocaleDateString() : "-"}</td>
          <td>Completed</td>
          <td>
            <button 
              class="view-report-btn" 
              data-userid="${userId}"
              data-assessment="${assessmentName}"
              data-attempt="${attemptNumber}">
              📄 View
            </button>
          </td>
        </tr>`;
    });

    document.querySelectorAll(".view-report-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const userId = btn.dataset.userid;
        const assessment = btn.dataset.assessment;
        const attempt = parseInt(btn.dataset.attempt, 10);
        showResponseReport(userId, assessment, attempt);
      });
    });
  }

  // -------------------------------
  // 📤 EXPORT FUNCTIONS
  // -------------------------------
  function exportToCSV(data) {
    if (!data || !data.length) return;
    const headers = Object.keys(data[0]);
    const csv = [headers.join(",")].concat(
      data.map(row => headers.map(h => `"${row[h] || ""}"`).join(","))
    ).join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "user_response_summary.csv";
    link.click();
  }

  function exportResponseDetailsToCSV() {
    const table = document.getElementById("response-details-table");
    if (!table) return alert("❌ No response table found");

    const rows = Array.from(table.querySelectorAll("tr"));
    const csv = rows
      .map(row => {
        const cells = Array.from(row.querySelectorAll("th, td"));
        return cells.map(cell => `"${cell.textContent.trim()}"`).join(",");
      })
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "response_details.csv";
    link.click();
  }
})();

// -------------------------------
// 📜 SHOW RESPONSE REPORT
// -------------------------------
window.showResponseReport = async function (userId, assessmentName, attemptNumber) {
  const section = document.getElementById("response-detail-section");
  const body = document.getElementById("response-detail-body");
  section.classList.remove("hidden");
  body.innerHTML = "<tr><td colspan='8'>⏳ Loading responses...</td></tr>";

  const { data, error } = await client
    .from("user_response_summary")
    .select("*")
    .eq("User ID", userId)
    .eq("Assessment", assessmentName)
    .eq("attempt_number", attemptNumber);

  if (error || !data) {
    console.error("❌ Error loading response report:", error);
    body.innerHTML = "<tr><td colspan='8'>❌ Failed to load responses</td></tr>";
    return;
  }

  body.innerHTML = "";
  data.forEach(row => {
    body.innerHTML += `
      <tr>
        <td>${row["User Name"]}</td>
        <td>${row["Assessment"]}</td>
        <td>${row["Question"]}</td>
        <td>${row["Selected Option"]}</td>
        <td>${row["Time Taken (sec)"] || "-"}</td>
        <td>${row["Tendencies"]}</td>
        <td>${row["Dimensions"]}</td>
        <td>${new Date(row["Response Timestamp"]).toLocaleString()}</td>
      </tr>`;
  });
};
