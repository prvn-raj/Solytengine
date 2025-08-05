// assignments.js - updated to match intended drag-drop UX with target selection and grouped recipients
(() => {
  let allAssessments = [];
  let allUsers = [];
  let allCohorts = [];
  let selectedTargets = []; // { id, type }
  let droppedAssessments = []; // ordered [{ id, name, total_questions }]
  let allAssignments = [];
  let emailMap = {};
  let currentPage = 1;
  const rowsPerPage = 10;

  async function initAssignmentsPage() {
    await loadTargets();
    await loadAssessments();
    await loadExistingAssignments();
    setupDropZone();
    document.getElementById("save-assignment-btn").addEventListener("click", handleSubmit);
    document.getElementById("export-btn")?.addEventListener("click", exportAssignments);
    document.getElementById("search-input")?.addEventListener("input", filterAssignments);
    document.getElementById("recipient-search")?.addEventListener("input", filterRecipients);
  }

   async function loadTargets() {
    const userRes = await client.from("app_users").select("id, email, designation").eq("is_active", true);
    const cohortRes = await client.from("cohorts").select("id, name").eq("is_active", true);
    allUsers = userRes.data || [];
    allCohorts = cohortRes.data || [];

    const container = document.getElementById("recipient-list");
    container.innerHTML = "";

    const designationMap = {};
    allUsers.forEach(u => {
      const designation = u.designation || "Others";
      if (!designationMap[designation]) designationMap[designation] = [];
      designationMap[designation].push(u);
    });

    Object.entries(designationMap).forEach(([designation, users]) => {
      const groupBox = document.createElement("div");
      groupBox.className = "recipient-group collapsed";

      const title = document.createElement("div");
      title.className = "recipient-group-title";
      title.textContent = `👤 ${designation}`;
      groupBox.appendChild(title);

      users.forEach(u => {
        const el = document.createElement("div");
        el.className = "recipient-tag";
        el.textContent = u.email;
        el.dataset.id = u.id;
        el.dataset.type = "user";
        el.onclick = () => toggleTarget(el);
        groupBox.appendChild(el);
      });

      container.appendChild(groupBox);
    });

    const cohortBox = document.createElement("div");
    cohortBox.className = "recipient-group collapsed";
    const cohortTitle = document.createElement("div");
    cohortTitle.className = "recipient-group-title";
    cohortTitle.textContent = "👥 Cohorts";
    cohortBox.appendChild(cohortTitle);

    allCohorts.forEach(c => {
      const el = document.createElement("div");
      el.className = "recipient-tag cohort-tag";
      el.textContent = c.name;
      el.dataset.id = c.id;
      el.dataset.type = "cohort";
      el.onclick = () => toggleTarget(el);
      cohortBox.appendChild(el);
    });

    container.appendChild(cohortBox);

    setTimeout(() => {
  document.querySelectorAll('.recipient-group-title').forEach(title => {
    title.addEventListener('click', () => {
      const group = title.parentElement;
      group.classList.toggle('collapsed');
    });
  });
}, 0);

  }

  function toggleTarget(div) {
    const id = div.dataset.id;
    const type = div.dataset.type;
    const idx = selectedTargets.findIndex(r => r.id === id && r.type === type);
    if (idx >= 0) {
      selectedTargets.splice(idx, 1);
      div.classList.remove("selected");
    } else {
      selectedTargets.push({ id, type });
      div.classList.add("selected");
    }
  }

  async function loadAssessments() {
    const { data } = await client.from("assessments")
      .select("id, name, total_questions, max_attempts")
      .eq("is_active", true)
      .eq("status", "ready")
      .order("created_at", { ascending: false });

    allAssessments = data || [];
    const container = document.getElementById("assessment-pool");
    container.innerHTML = "";

    allAssessments.forEach(a => {
      const div = document.createElement("div");
      div.className = "assessment-block";
      div.draggable = true;
      div.dataset.id = a.id;
      div.dataset.name = a.name;
      div.dataset.qs = a.total_questions;
      div.innerHTML = `<strong>${a.name}</strong><br><small>${a.total_questions} Qs</small>`;
      div.addEventListener("dragstart", e => {
        e.dataTransfer.setData("text/plain", JSON.stringify(a));
      });
      container.appendChild(div);
    });
  }

  function setupDropZone() {
  const zone = document.getElementById("drop-zone");

  zone.addEventListener("dragover", e => e.preventDefault());

  zone.addEventListener("drop", e => {
    e.preventDefault();

    // Only handle external drag (from pool) if no internal reorder in progress
    const reorderIdx = e.dataTransfer.getData("reorder-index");
    if (reorderIdx) return; // already handled by inner div drop

    const raw = e.dataTransfer.getData("text/plain");
    if (!raw) return;

    const data = JSON.parse(raw);
    if (!data.id || !data.name) return;

    if (!droppedAssessments.find(d => d.id === data.id)) {
      droppedAssessments.push(data);
      renderDropZone();
    }
  });
}


function renderDropZone() {
  const zone = document.getElementById("drop-zone");
  zone.innerHTML = "";

  droppedAssessments.forEach((a, idx) => {
    const div = document.createElement("div");
    div.className = "assessment-block droppable";
    div.dataset.id = a.id;
    div.dataset.index = idx;
    div.draggable = true;

    div.innerHTML = `${idx + 1}. ${a.name} (${a.total_questions} Qs)
      <button onclick="this.parentElement.remove(); window.refreshDropZone();">🗑️</button>`;

    // Internal reorder drag logic
    div.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("reorder-index", idx);  // special key
    });

    div.addEventListener("dragover", (e) => {
      e.preventDefault();
      div.classList.add("drag-over");
    });

    div.addEventListener("dragleave", () => {
      div.classList.remove("drag-over");
    });

    div.addEventListener("drop", (e) => {
      e.preventDefault();
      div.classList.remove("drag-over");

      const fromIndex = e.dataTransfer.getData("reorder-index");
      if (fromIndex) {
        const toIndex = parseInt(div.dataset.index);
        const moved = droppedAssessments.splice(fromIndex, 1)[0];
        droppedAssessments.splice(toIndex, 0, moved);
        renderDropZone();
      }
    });

    zone.appendChild(div);
  });
}



  window.refreshDropZone = () => {
    const zone = document.getElementById("drop-zone");
    droppedAssessments = Array.from(zone.children).map(div => {
      const id = div.dataset.id;
      return allAssessments.find(a => a.id === id);
    });
    renderDropZone();
  };

async function handleSubmit() {
  if (!selectedTargets.length) return alert("❗ Select recipients");
  if (!droppedAssessments.length) return alert("❗ Drop assessments to assign");

  const seen = new Set();
  for (const target of selectedTargets) {
    for (let i = 0; i < droppedAssessments.length; i++) {
      const key = `${target.id}-${i + 1}`;
      if (seen.has(key)) {
        alert(`❌ Duplicate sequence number ${i + 1} for same target`);
        return;
      }
      seen.add(key);
    }
  }

  const user = await client.auth.getUser();
  const created_by = user.data.user.id;
  const insertPromises = [];

  for (const target of selectedTargets) {
    for (let i = 0; i < droppedAssessments.length; i++) {
      const a = droppedAssessments[i];
      const insertObj = {
        assessment_id: a.id,
        assignment_type: target.type === "cohort" ? "cohort" : "individual",
        app_user_id: target.type === "user" ? target.id : null,
        cohort_id: target.type === "cohort" ? target.id : null,
        sequence_number: i + 1,
        created_by,
        start_date: new Date().toISOString(),
        end_date: null, // or set a deadline like: new Date(Date.now() + 7 * 86400000).toISOString(),
        max_attempts: a.max_attempts || 2
      };
      insertPromises.push(
        client.from("assessment_assignments").insert(insertObj)
      );
    }
  }

  await Promise.all(insertPromises);
  alert("✅ Assignment Mapped!");
  await loadExistingAssignments();
  droppedAssessments = [];
  renderDropZone();
  selectedTargets = [];
  document.querySelectorAll(".recipient-tag.selected").forEach(el => el.classList.remove("selected"));
}


  async function loadExistingAssignments() {
    const { data, error } = await client
      .from("assessment_assignments")
      .select("id, assignment_type, assessment_id, cohort_id, app_user_id, sequence_number, created_at")
      .order("created_at", { ascending: false });

    if (error) return console.error("Error fetching assignments:", error);
    allAssignments = data || [];
    renderAssignmentTable(allAssignments);
  }

 function renderAssignmentTable(list) {
  const tbody = document.getElementById("assignment-list");
  tbody.innerHTML = "";

 const grouped = {};
list.forEach(row => {
  const targetId = row.assignment_type === "cohort" ? row.cohort_id : row.app_user_id;
  const timestamp = new Date(row.created_at).getTime();
  const roundedTimeKey = Math.floor(timestamp / 10000); // group by 10-second blocks
  const key = `${row.assignment_type}-${targetId}-${roundedTimeKey}`;

  if (!grouped[key]) {
    grouped[key] = {
      type: row.assignment_type,
      targetId,
      createdAt: row.created_at,
      assignments: []
    };
  }

  grouped[key].assignments.push(row);
});


  const groupedList = Object.values(grouped);
  const start = (currentPage - 1) * rowsPerPage;
  const pageItems = groupedList.slice(start, start + rowsPerPage);

  pageItems.forEach(group => {
    const target = group.type === "cohort"
      ? allCohorts.find(c => c.id === group.targetId)
      : allUsers.find(u => u.id === group.targetId);
    const targetName = group.type === "cohort" ? target?.name || "-" : target?.email || "-";

    const assessments = group.assignments
      .sort((a, b) => a.sequence_number - b.sequence_number)
      .map(row => {
        const a = allAssessments.find(as => as.id === row.assessment_id);
        return `${a?.name || "-"} (${row.sequence_number})`;
      }).join(", ");

    const createdAt = new Date(group.assignments[0]?.created_at).toLocaleString();

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${targetName}</td>
      <td>${group.type}</td>
      <td>${assessments}</td>
      <td>${createdAt}</td>
      <td>
        <div class="assignment-actions">
          <button class="delete-btn" onclick="deleteAssignment('${group.assignments[0].id}')">🗑️</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  renderPagination(groupedList); // ✅ important!
}



  function renderPagination(groupedData) {
  const totalPages = Math.ceil(groupedData.length / rowsPerPage);
  const container = document.getElementById("pagination");
  if (!container) return;

  container.innerHTML = `
    <button ${currentPage === 1 ? "disabled" : ""} onclick="changeAssignmentPage(${currentPage - 1})">◀ </button>
    <span> Page ${currentPage} of ${totalPages} </span>
    <button ${currentPage === totalPages ? "disabled" : ""} onclick="changeAssignmentPage(${currentPage + 1})"> ❯</button>
  `;
}


  window.changeAssignmentPage = (page) => {
    currentPage = page;
    renderAssignmentTable(allAssignments);
  };

  function attachEditListeners() {
    document.querySelectorAll(".edit-btn").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        const id = e.target.dataset.id;
        const row = allAssignments.find(a => a.id === id);
        if (!row) return;

        const newSeq = prompt("Update sequence number:", row.sequence_number);
        if (newSeq !== null) {
          await client.from("assessment_assignments").update({ sequence_number: parseInt(newSeq) }).eq("id", id);
          await loadExistingAssignments();
        }
      });
    });
  }

  function exportAssignments() {
  const headers = ["Target", "Target Type", "Assessments", "Created At"];
  
  // Group by app_user_id or cohort_id
  const grouped = {};
  allAssignments.forEach(row => {
    const key = row.assignment_type === "cohort" ? `cohort-${row.cohort_id}` : `user-${row.app_user_id}`;
    if (!grouped[key]) {
      grouped[key] = {
        type: row.assignment_type,
        targetId: row.assignment_type === "cohort" ? row.cohort_id : row.app_user_id,
        assignments: []
      };
    }
    grouped[key].assignments.push(row);
  });

  const rows = Object.values(grouped).map(group => {
    const target = group.type === "cohort"
      ? allCohorts.find(c => c.id === group.targetId)
      : allUsers.find(u => u.id === group.targetId);
    const targetName = group.type === "cohort" ? (target?.name || "") : (target?.email || "");

    const assessments = group.assignments
      .sort((a, b) => a.sequence_number - b.sequence_number)
      .map(row => {
        const a = allAssessments.find(as => as.id === row.assessment_id);
        return `${a?.name || "-"} (${row.sequence_number})`;
      }).join("; ");

    const createdAt = new Date(group.assignments[0]?.created_at).toLocaleString();

    return [targetName, group.type, assessments, createdAt];
  });

  const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "assignments.csv";
  link.click();
}


  function filterAssignments() {
    const keyword = document.getElementById("search-input").value.toLowerCase();
    const filtered = allAssignments.filter(row => {
      const cohort = allCohorts.find(c => c.id === row.cohort_id);
      const user = allUsers.find(u => u.id === row.app_user_id);
      const targetName = row.assignment_type === "cohort" ? (cohort?.name || "") : (user?.email || "");
      return targetName.toLowerCase().includes(keyword);
    });
    renderAssignmentTable(filtered);
  }

 window.deleteAssignment = async (id) => {
  const targetRow = allAssignments.find(row => row.id === id);
  if (!targetRow) return;

  const isCohort = targetRow.assignment_type === "cohort";
  const targetKey = isCohort ? targetRow.cohort_id : targetRow.app_user_id;

  const groupAssignments = allAssignments.filter(row =>
    row.assignment_type === targetRow.assignment_type &&
    (isCohort ? row.cohort_id === targetKey : row.app_user_id === targetKey)
  );

  const confirmed = confirm(`Are you sure you want to delete all ${groupAssignments.length} assignments for this ${isCohort ? "cohort" : "user"}?`);
  if (!confirmed) return;

  const deleteIds = groupAssignments.map(r => r.id);
  await client.from("assessment_assignments").delete().in("id", deleteIds);
  await loadExistingAssignments();
};


  function filterRecipients() {
    const keyword = document.getElementById("recipient-search").value.toLowerCase();
    document.querySelectorAll("#recipient-list .recipient-tag").forEach(tag => {
      const text = tag.textContent.toLowerCase();
      tag.style.display = text.includes(keyword) ? "inline-block" : "none";
    });
  }

// Collapse/expand behavior for recipient groups
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll('.recipient-group-title').forEach(title => {
    title.addEventListener('click', () => {
      const group = title.parentElement;
      group.classList.toggle('collapsed');
    });
  });
});


  initAssignmentsPage();
})();
