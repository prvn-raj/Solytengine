document.addEventListener("DOMContentLoaded", async () => {
  const contentArea = document.getElementById("content-area");
  const scriptContainerId = "dynamic-script-loader";

  // Fetch admin's name
  const userRes = await client.auth.getUser();
  const user = userRes.data.user;
  if (user) {
    const fullName = user.user_metadata?.full_name || user.email?.split("@")[0] || "Admin";
    const topbar = document.querySelector(".topbar span");
    if (topbar) {
      topbar.textContent = `Welcome, ${toCamelCase(fullName)}`;
    }
  }

  // Load default page
  await loadPage("dashboard.html");

  // Sidebar links
  document.querySelectorAll(".sidebar a[data-page]").forEach(link => {
    link.addEventListener("click", async (e) => {
      e.preventDefault();
      const page = link.getAttribute("data-page");
      if (page) {
        await loadPage(page);
        document.querySelectorAll(".sidebar .nav a").forEach(l => l.classList.remove("active"));
        link.classList.add("active");
      }
    });
  });

  // Logout button
  document.getElementById("logout-btn").addEventListener("click", async () => {
    await client.auth.signOut();
    window.location.href = "index.html";
  });

  // MindMatrix toggle
  const toggle = document.getElementById("mindmatrix-toggle");
  const submenu = document.getElementById("mindmatrix-submenu");
  toggle?.addEventListener("click", (e) => {
    e.preventDefault();
    submenu.style.display = submenu.style.display === "flex" ? "none" : "flex";
  });
  const currentPage = window.location.href;
  if (currentPage.includes("dimensions.html") || currentPage.includes("tendencies.html")) {
    submenu.style.display = "flex";
  }

  // Listen for dashboard card clicks
  window.addEventListener("message", async (event) => {
    const { action, page } = event.data;
    console.log("📥 Received postMessage:", event.data);
    if (action === "loadPage" && page) {
      await loadPage(page);
      document.querySelectorAll(".sidebar .nav a").forEach(link => {
        const linkPage = link.getAttribute("data-page");
        link.classList.toggle("active", linkPage === page);
      });
    }
  });

  // 🧠 Make loadPage globally accessible
  window.loadPage = loadPage;

  // Utility: Capitalize name
  function toCamelCase(str) {
    return str
      .toLowerCase()
      .split(/[\s._-]+/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  // 🧩 Load HTML, CSS and JS dynamically
  async function loadPage(page) {
    try {
      const res = await fetch(`/${page}`);
      const html = await res.text();
      const temp = document.createElement("div");
      temp.innerHTML = html;
      const innerContent = temp.querySelector(".page-content");
      contentArea.innerHTML = "";
      contentArea.appendChild(innerContent || temp);

      // Remove old script
      document.getElementById(scriptContainerId)?.remove();

      // Inject CSS
      document.getElementById("dynamic-css")?.remove();
      const cssName = page.replace(".html", ".css");
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = `/css/${cssName}`;
      css.id = "dynamic-css";
      document.head.appendChild(css);

      // Inject JS
      const scriptName = page.replace(".html", ".js");
      if (scriptName !== "admin_dashboard.js") {
        const script = document.createElement("script");
        script.type = "module";
        script.id = scriptContainerId;
        if (scriptName === "dashboard.js") {
          script.innerHTML = `
            import { initDashboard } from "/js/dashboard.js";
            initDashboard(client);
          `;
        } else {
          script.innerHTML = `import "/js/${scriptName}";
            if (typeof initQuestionsPage === 'function') initQuestionsPage();
            if (typeof initDimensionsPage === 'function') initDimensionsPage();
            if (typeof initTendenciesPage === 'function') initTendenciesPage();
            if (typeof initAssessmentsPage === 'function') initAssessmentsPage();
            if (typeof initAssignmentsPage === 'function') initAssignmentsPage();
            if (typeof initUsersPage === 'function') initUsersPage();
            if (typeof initCohortsPage === 'function') initCohortsPage();
            if (typeof initReportsPage === 'function') initReportsPage();`;
        }
        document.body.appendChild(script);
      }
    } catch (err) {
      contentArea.innerHTML = `<p style="color: red;">Failed to load ${page}</p>`;
      console.error("Page load error:", err);
    }
  }
});
