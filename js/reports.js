// reports.js
(async () => {
  const assignmentBody = document.getElementById("assignment-summary-body");
  const completedBody = document.getElementById("completed-summary-body");
  const responseBody = document.getElementById("response-detail-body");
  const exportBtn = document.getElementById("export-btn");
  const exportResponseBtn = document.getElementById("export-response-btn");

  const { data: assignments } = await client.from("assessment_assignments").select("*, assessments(name), app_users(user_id, first_name, last_name), cohorts(name), user_assessments(status)");
  renderAssignmentSummary(assignments);

  const { data: completions } = await client.from("user_assessments").select("*, app_users(user_id, first_name, last_name), assessments(name), attempt_number").eq("status", "completed");
  renderCompletedAssessments(completions);

  exportBtn?.addEventListener("click", async () => {
    const { data: responses } = await client.from("user_response_summary").select("*");
    exportToCSV(responses);
  });

  exportResponseBtn?.addEventListener("click", exportResponseDetailsToCSV);

  function renderAssignmentSummary(data) {
    assignmentBody.innerHTML = "";
    data.forEach(row => {
      const type = row.assignment_type;
      const target = row.app_user_id ? `${row.app_users.first_name} ${row.app_users.last_name}` : row.cohorts?.name || "-";
      const totalUsers = row.app_user_id ? 1 : row.cohort_id ? "👥" : "-";
      const completed = Array.isArray(row.user_assessments) ? row.user_assessments.filter(u => u.status === 'completed').length : 0;
      const progress = row.app_user_id ? (completed ? "✅" : "⏳") : "-";

      assignmentBody.innerHTML += `
        <tr>
          <td>${type}</td>
          <td>${row.assessments.name}</td>
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
    data.forEach(row => {
      const user = `${row.app_users.first_name} ${row.app_users.last_name}`;
      const userId = row.app_users.user_id;
      const assessmentName = row.assessments.name;
      const attemptNumber = row.attempt_number || 1;

      completedBody.innerHTML += `
        <tr>
          <td>${user}</td>
          <td>${assessmentName}</td>
          <td>${new Date(row.completed_at).toLocaleDateString()}</td>
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
    const csv = rows.map(row => {
      const cells = Array.from(row.querySelectorAll("th, td"));
      return cells.map(cell => `"${cell.textContent.trim()}"`).join(",");
    }).join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "response_details.csv";
    link.click();
  }
})();

window.showResponseReport = async function(userId, assessmentName, attemptNumber) {
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
