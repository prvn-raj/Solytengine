(() => {
  let allTendencies = [];
  let selectedTendencies = [];
  let dimensionMap = {};  // 🔧 Made dimensionMap global
  let allAssessments = [];
  let currentPage = 1;
  const rowsPerPage = 7;
  let currentEditId = null;

  async function initAssessmentsPage() {
    console.log("⚙️ initAssessmentsPage() running");
    await populateNextAssessmentId();
    await fetchTendencies();
    await loadAssessments();

    const form = document.getElementById("assessments-form");
    if (form) {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const name = document.getElementById("name").value.trim();
        const description = document.getElementById("description").value.trim();
        const total_questions = parseInt(document.getElementById("total_questions").value);
        const time_limit_minutes = parseInt(document.getElementById("time_limit_minutes").value);
        const randomize_questions = document.getElementById("randomize_questions").checked;
        const randomize_options = document.getElementById("randomize_options").checked;
        const allow_resume = document.getElementById("allow_resume").checked;
        const max_attempts = parseInt(document.getElementById("max_attempts").value);
        const assessment_id = document.getElementById("assessment_id").value;

        if (!name || !total_questions) {
          alert("Please fill all required fields.");
          return;
        }

        if (selectedTendencies.length === 0) {
          alert("Please select at least one tendency.");
          return;
        }

        const weightInputs = document.querySelectorAll(".weight-input");
        const totalWeight = [...weightInputs].reduce((acc, input) => acc + parseFloat(input.value || 0), 0);
        if (totalWeight !== 100) {
          alert(`❌ The total Weight % across tendencies must equal 100%. Current total: ${totalWeight}%`);
          return;
        }

        const admin = await client.auth.getUser();
        const created_by = admin.data.user?.id;

        const assessmentsData = {
          assessment_id,
          name,
          description,
          total_questions,
          time_limit_minutes,
          randomize_questions,
          randomize_options,
          allow_resume,
          max_attempts,
          created_by,
          status: "draft"
        };

        let inserted, error;
        if (currentEditId) {
          const response = await client
            .from("assessments")
            .update(assessmentsData)
            .eq("id", currentEditId)
            .select()
            .single();
          inserted = response.data;
          error = response.error;

          await client.from("assessment_tendency_weights").delete().eq("assessment_id", currentEditId);
        } else {
          const response = await client
            .from("assessments")
            .insert([assessmentsData])
            .select()
            .single();
          inserted = response.data;
          error = response.error;
        }

        if (error) {
          alert("Error saving assessment");
          console.error(error);
          return;
        }

        const tbody = document.getElementById("tendency-weight-table").querySelector("tbody");
        const rows = tbody.querySelectorAll("tr");

        for (const row of rows) {
          const tendencyId = row.getAttribute("data-id");
          const weight = parseInt(row.querySelector(".weight-input").value);

          if (weight == null || weight < 0) {
            alert("❌ Weight must be greater than or equal to zero for all selected tendencies.");
            return;
          }

          await client.from("assessment_tendency_weights").insert({
            assessment_id: inserted.id,
            tendency_id: tendencyId,
            weightage_percentage: weight
          });
        }

        form.reset();
        document.getElementById("tendency-weight-table").querySelector("tbody").innerHTML = "";
        selectedTendencies = [];
        currentEditId = null;
        await populateNextAssessmentId();
        await loadAssessments();

        alert("✅ Assessment and mappings saved successfully");
      });
    }

    const searchInput = document.getElementById("search-input");
    if (searchInput) {
      searchInput.addEventListener("input", () => {
        const keyword = searchInput.value.trim().toLowerCase();
        const filtered = allAssessments.filter(a => a.name.toLowerCase().includes(keyword));
        renderAssessmentsTable(filtered);
      });
    }

    const exportBtn = document.getElementById("export-btn");
    if (exportBtn) {
      exportBtn.addEventListener("click", () => {
        const csv = [
          ["Assessment ID", "Name", "Total Questions", "Time Limit (mins)", "Created At"],
          ...allAssessments.map(a => [
            a.assessment_id,
            a.name,
            a.total_questions,
            a.time_limit_minutes || "-",
            new Date(a.created_at).toLocaleDateString()
          ])
        ];

        const blob = new Blob([csv.map(e => e.join(",")).join("\n")], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", "assessments.csv");
        link.click();
      });
    }
  }

  function validateWeightSumLive() {
    const weightInputs = document.querySelectorAll(".weight-input");
    const totalWeight = [...weightInputs].reduce((acc, input) => acc + parseFloat(input.value || 0), 0);
    const btn = document.querySelector("button[form='assessments-form']");
    if (btn) {
      btn.disabled = totalWeight !== 100;
      btn.innerText = totalWeight !== 100
        ? `⚠ Total Weight must be 100% (Current: ${totalWeight}%)`
        : "💾 Save Assessment & Tendencies";
    }
  }

 async function populateNextAssessmentId() {
  const input = document.getElementById("assessment_id");
  if (!input) return;

  const { data, error } = await client
    .from("assessments")
    .select("assessment_id");

  if (error) {
    console.error("Error fetching assessments:", error);
    input.value = "SOLASS-001";
    return;
  }

  let nextId = "SOLASS-001";

  if (data && data.length > 0) {
    // extract the numeric part from all IDs
    const numbers = data
      .map(a => parseInt(a.assessment_id?.split("-")[1] || "0"))
      .filter(n => !isNaN(n));

    const maxNum = Math.max(...numbers, 0);
    nextId = `SOLASS-${String(maxNum + 1).padStart(3, "0")}`;
  }

  input.value = nextId;
}


  async function fetchTendencies() {
  const { data: tendencies } = await client
    .from("tendencies")
    .select("id, name, dimension_id, color")
    .eq("is_active", true)
    .order("name", { ascending: true });

  const { data: dimensions } = await client
    .from("dimensions")
    .select("id, name, color");

  dimensionMap = {};
  dimensions.forEach(d => {
    dimensionMap[d.id] = { name: d.name, color: d.color };
  });

  allTendencies = tendencies;

  // Group tendencies by dimension
  const grouped = {};
  tendencies.forEach(t => {
    if (!grouped[t.dimension_id]) grouped[t.dimension_id] = [];
    grouped[t.dimension_id].push(t);
  });

  // Render accordion
  const container = document.getElementById("tendency-accordion-container");
  container.innerHTML = "";

  Object.keys(grouped).forEach(dimId => {
    const dimName = dimensionMap[dimId]?.name || dimId;
    const dimColor = dimensionMap[dimId]?.color || "#999";

    const section = document.createElement("div");
    section.className = "accordion-section";
    section.innerHTML = `
      <div class="accordion-header" style="cursor:pointer; padding:8px; border:1px solid #ccc; margin-bottom:4px; background:${dimColor}20;">
        <strong>${dimName}</strong>
       
      </div>
      <div class="accordion-body" style="display:none; padding:8px;">
        ${grouped[dimId].map(t => `
          <div class="tendency-item" 
               data-id="${t.id}" 
               data-dimension="${dimId}" 
               style="cursor:pointer; display:inline-block; padding:6px 10px; margin:4px; background:${t.color || "#777"}; color:#fff; border-radius:12px;">
            ${t.name}
          </div>
        `).join("")}
      </div>
    `;
    container.appendChild(section);

  
// Toggle collapse
const header = section.querySelector(".accordion-header");
const body = section.querySelector(".accordion-body");
body.style.display = "block"; // open by default
header.classList.add("open"); // set arrow ▼ by default

header.addEventListener("click", () => {
  const isOpen = body.style.display === "block";
  body.style.display = isOpen ? "none" : "block";
  header.classList.toggle("open");
});

    // Add click handler for tendencies
    body.querySelectorAll(".tendency-item").forEach(tag => {
      tag.addEventListener("click", () => {
        const tendencyId = tag.getAttribute("data-id");
        const dimId = tag.getAttribute("data-dimension");
        const tendency = tendencies.find(x => x.id === tendencyId);
        handleTendencyClick(tendency);
      });
    });
  });

  // Global search filter
  document.getElementById("tendency-search").addEventListener("input", (e) => {
    const keyword = e.target.value.toLowerCase();
    document.querySelectorAll(".tendency-item").forEach(item => {
      item.style.display = item.textContent.toLowerCase().includes(keyword) ? "inline-block" : "none";
    });
  });
}


  function handleTendencyClick(tendency) {
    if (selectedTendencies.includes(tendency.id)) return;
    selectedTendencies.push(tendency.id);

    const row = document.createElement("tr");
    row.setAttribute("data-id", tendency.id);
    row.innerHTML = `
      <td>${tendency.name}</td>
      <td>${dimensionMap[tendency.dimension_id]?.name || tendency.dimension_id}</td>
      <td>
        <input type="range" class="assessment-slider weight-input" min="0" max="100" value="0" />
        <span class="weight-value">0%</span>
      </td>
      <td><button class="action-btn action-delete" onclick="this.closest('tr').remove(); validateWeightSumLive();">🗑️</button></td>
    `;
    document.getElementById("tendency-weight-table").querySelector("tbody").appendChild(row);

    const slider = row.querySelector(".weight-input");
    const label = row.querySelector(".weight-value");
    slider.addEventListener("input", () => {
      label.textContent = `${slider.value}%`;
      validateWeightSumLive();
    });
  }

 async function loadAssessments() {
  

  // 📌 Step 1: fetch assessments
  const { data: assessments, error } = await client
    .from("assessments")
    .select("id, assessment_id, name, total_questions, time_limit_minutes, created_at, created_by, status")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to load assessments:", error);
    return;
  }

  // 📌 Step 2: fetch user_roles to map supabase_user_id → email
  const { data: roles, error: rolesErr } = await client
    .from("user_roles")
    .select("supabase_user_id, email");

  if (rolesErr) {
    console.error("Failed to load user roles:", rolesErr);
  }

  const creatorMap = {};
  (roles || []).forEach(r => {
    creatorMap[r.supabase_user_id] = r.email;
  });

  // 📌 Step 3: enrich assessments with creatorEmail
  allAssessments = (assessments || []).map(a => ({
    ...a,
    creatorEmail: creatorMap[a.created_by] || "-"
  }));

  // 📌 Step 4: render updated table
  renderAssessmentsTable(allAssessments);
}


  function renderAssessmentsTable(dataList) {
    const table = document.getElementById("assessment-table-body");
    if (!table) return;
    table.innerHTML = "";

    const start = (currentPage - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    const pageItems = dataList.slice(start, end);

    pageItems.forEach(a => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${a.assessment_id || "-"}</td>
        <td>${a.name}</td>
        <td>${a.total_questions}</td>
        <td>${a.time_limit_minutes || "-"}</td>
        <td>${new Date(a.created_at).toLocaleDateString()}</td>
        <td>
        <span class="status-badge ${a.status || 'draft'}">
        ${a.status?.toUpperCase() || 'DRAFT'}
        </span>
        </td>
        <td>${a.creatorEmail}</td>
        <td>
          <button class="action-btn action-edit" data-id="${a.id}">✏️</button>
          <button class="action-btn action-delete" data-id="${a.id}">🗑️</button>
          <button class="action-btn action-test" data-id="${a.id}">🧪 Test</button>
        </td>
      `;
      table.appendChild(row);

      // 🧪 Test button: clear tendencies before launching
      row.querySelector(".action-test").addEventListener("click", () => {
        document.getElementById("tendency-weight-table").querySelector("tbody").innerHTML = "";
        selectedTendencies = [];``
        window.open(`admin_take.html?id=${a.id}`, "_blank");
      });
    });

    document.querySelectorAll(".action-edit").forEach(btn => {
      btn.addEventListener("click", () => loadAssessmentForEdit(btn.dataset.id));
    });

    document.querySelectorAll(".action-delete").forEach(btn => {
      btn.addEventListener("click", () => deleteAssessment(btn.dataset.id));
    });

    renderPagination(dataList);
  }

  async function loadAssessmentForEdit(id) {
    const { data, error } = await client
      .from("assessments")
      .select("*")
      .eq("id", id)
      .single();
    if (error) return alert("Failed to load assessment");

    currentEditId = id;
    document.getElementById("assessment_id").value = data.assessment_id;
    document.getElementById("name").value = data.name;
    document.getElementById("description").value = data.description;
    document.getElementById("total_questions").value = data.total_questions;
    document.getElementById("time_limit_minutes").value = data.time_limit_minutes;
    document.getElementById("max_attempts").value = data.max_attempts;
    document.getElementById("randomize_questions").checked = data.randomize_questions;
    document.getElementById("randomize_options").checked = data.randomize_options;
    document.getElementById("allow_resume").checked = data.allow_resume;

    // ✅ Clear old tendencies before adding new
    selectedTendencies = [];
    const tbody = document.getElementById("tendency-weight-table").querySelector("tbody");
    tbody.innerHTML = "";

    const { data: mappings } = await client
      .from("assessment_tendency_weights")
      .select("tendency_id, weightage_percentage")
      .eq("assessment_id", id);

    for (const m of mappings) {
      const tendency = allTendencies.find(t => t.id === m.tendency_id);
      if (!tendency) continue;
      selectedTendencies.push(tendency.id);

      const row = document.createElement("tr");
      row.setAttribute("data-id", tendency.id);
      row.innerHTML = `
        <td>${tendency.name}</td>
        <td>${dimensionMap[tendency.dimension_id]?.name || tendency.dimension_id}</td>
        <td>
          <input type="range" class="assessment-slider weight-input" min="0" max="100" value="${m.weightage_percentage}" />
          <span class="weight-value">${m.weightage_percentage}%</span>
        </td>
        <td><button onclick="this.closest('tr').remove(); validateWeightSumLive();">🗑️</button></td>`;
      tbody.appendChild(row);

      const slider = row.querySelector(".weight-input");
      const label = row.querySelector(".weight-value");
      slider.addEventListener("input", () => {
        label.textContent = `${slider.value}%`;
        validateWeightSumLive();
      });
    }
  }

  async function deleteAssessment(id) {
    if (!confirm("Are you sure you want to delete this assessment?")) return;
    await client.from("assessment_tendency_weights").delete().eq("assessment_id", id);
    await client.from("assessments").delete().eq("id", id);
    await loadAssessments();
  }

  function renderPagination(dataList) {
    const totalPages = Math.ceil(dataList.length / rowsPerPage);
    const container = document.getElementById("pagination");
    if (!container) return;
    container.innerHTML = `
      <button ${currentPage === 1 ? "disabled" : ""} onclick="changeAssessmentPage(${currentPage - 1})">◀ Prev</button>
      <span> Page ${currentPage} of ${totalPages} </span>
      <button ${currentPage === totalPages ? "disabled" : ""} onclick="changeAssessmentPage(${currentPage + 1})">Next ❯</button>`;
  }

  window.addEventListener("message", (event) => {
    if (event.data?.type === "refreshAssessments") {
      loadAssessments();  // Re-fetch assessments and update table
    }
  });

  window.changeAssessmentPage = (page) => {
    currentPage = page;
    renderAssessmentsTable(allAssessments);
  };
  window.initAssessmentsPage = initAssessmentsPage;
  initAssessmentsPage();
})();
