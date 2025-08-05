export async function initDashboard(client) {
  console.log("✅ dashboard.js loaded");

  const cards = document.querySelectorAll(".card");

  cards.forEach(card => {
    card.style.cursor = "pointer";
    card.addEventListener("click", () => {
      const page = card.getAttribute("data-page");
      console.log("📨 Sending loadPage for:", page);
      if (page && window.parent !== window) {
        window.parent.postMessage({ action: "loadPage", page }, "*");
      }
    });
  });

  try {
    const [questions, assessments, users, assignments, reports] = await Promise.all([
      client.from("questions").select("id", { count: "exact" }),
      client.from("assessments").select("id", { count: "exact" }),
      client.from("app_users").select("id", { count: "exact" }),
      client.from("assessment_assignments").select("id", { count: "exact" }),
      client.from("user_assessments").select("id", { count: "exact" }).eq("status", "completed")
    ]);

    console.log("📊 Supabase raw responses:", { questions, assessments, users, assignments, reports });

    if (!questions.error) document.getElementById("question-count").textContent = questions.count ?? 0;
    if (!assessments.error) document.getElementById("assessment-count").textContent = assessments.count ?? 0;
    if (!users.error) document.getElementById("user-count").textContent = users.count ?? 0;
    if (!assignments.error) document.getElementById("assignment-count").textContent = assignments.count ?? 0;
    if (!reports.error) document.getElementById("report-count").textContent = reports.count ?? 0;

  } catch (err) {
    console.error("❌ Dashboard count fetch error:", err);
  }
}
