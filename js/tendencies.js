(() => {
  let currentEditId = null;
  let allTendencies = [];
  let dimensionMap = {};
  let dimensionColorMap = {};
  let currentPage = 1;
  const rowsPerPage = 10;

  async function initTendenciesPage() {
    const form = document.getElementById("tendency-form");
    const exportBtn = document.getElementById("export-btn");
    const searchInput = document.getElementById("search-input");

    await fetchDimensions();
    await populateNextTendencyId();
    await fetchAndDisplayTendencies();

    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      const tendency_id = document.getElementById("tendency-id").value.trim();
      const name = document.getElementById("tendency-name").value.trim();
      const description = document.getElementById("tendency-description").value.trim();
      const dimension_id = document.getElementById("dimension-select").value;
      const isActive = document.getElementById("tendency-status").value === "true";
      const color = document.getElementById("tendency-color").value;

      const admin = await client.auth.getUser();
      const createdBy = admin.data.user?.id;

      if (!name || !dimension_id || !createdBy) return;

      const payload = {
        tendency_id,
        name,
        description,
        dimension_id,
        is_active: isActive,
        color,
        created_by: createdBy,
      };

      if (currentEditId) {
        await client.from("tendencies").update(payload).eq("id", currentEditId);
        currentEditId = null;
      } else {
        await client.from("tendencies").insert([payload]);
      }

      form.reset();
      await populateNextTendencyId();
      await fetchAndDisplayTendencies();
    });

    if (exportBtn) {
      exportBtn.addEventListener("click", exportTableToCSV);
    }

    if (searchInput) {
      searchInput.addEventListener("input", () => {
        const keyword = searchInput.value.trim().toLowerCase();
        const filtered = allTendencies.filter(t =>
          t.name.toLowerCase().includes(keyword) ||
          (t.description || "").toLowerCase().includes(keyword)
        );
        renderTendencyTable(filtered);
      });
    }

    document.getElementById("dimension-select").addEventListener("change", () => {
      const selectedId = document.getElementById("dimension-select").value;
      const baseColor = dimensionColorMap[selectedId] || "#ccc";
      populateTendencyColorSelect(baseColor);
    });
  }

  async function fetchDimensions() {
    const { data, error } = await client
      .from("dimensions")
      .select("id, name, color")
      .order("name", { ascending: true });

    if (error) {
      console.error("❌ Failed to fetch dimensions:", error);
      return;
    }

    const select = document.getElementById("dimension-select");
    dimensionMap = {};
    dimensionColorMap = {};
    select.innerHTML = `<option value="">Select a Dimension</option>`;

    data.forEach(d => {
      dimensionMap[d.id] = d.name;
      dimensionColorMap[d.id] = d.color || "#ccc";

      const opt = document.createElement("option");
      opt.value = d.id;
      opt.textContent = d.name;
      opt.style.backgroundColor = d.color || "#eee";
      opt.style.color = "#000";
      select.appendChild(opt);
    });
  }

  function populateTendencyColorSelect(baseColor) {
    const colorRow = document.getElementById("color-select-row");
    const colorSelect = document.getElementById("tendency-color");

    const shades = generateColorShades(baseColor, 5);
    colorSelect.innerHTML = "";

    shades.forEach((shade, idx) => {
      const opt = document.createElement("option");
      opt.value = shade;
      opt.textContent = `Shade ${idx + 1}`;
      opt.style.backgroundColor = shade;
      opt.style.color = "#000";
      colorSelect.appendChild(opt);
    });

    colorRow.style.display = "block";
  }

  function generateColorShades(base, count) {
    const shades = [];
    for (let i = 0; i < count; i++) {
      const factor = 1 - i * 0.15;
      const r = Math.floor(parseInt(base.slice(1, 3), 16) * factor);
      const g = Math.floor(parseInt(base.slice(3, 5), 16) * factor);
      const b = Math.floor(parseInt(base.slice(5, 7), 16) * factor);
      const hex = `#${r.toString(16).padStart(2, '0')}${g
        .toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
      shades.push(hex);
    }
    return shades;
  }

  async function populateNextTendencyId() {
    const { data } = await client
      .from("tendencies")
      .select("tendency_id")
      .order("created_at", { descending: true })
      .limit(1000);

    let maxNum = 0;
    (data || []).forEach(t => {
      const match = t.tendency_id?.match(/SOLTEN-(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxNum) {
          maxNum = num;
        }
      }
    });

    document.getElementById("tendency-id").value = "SOLTEN-" + String(maxNum + 1).padStart(3, "0");
  }

  async function fetchAndDisplayTendencies() {
    const { data, error } = await client
      .from("tendencies")
      .select("*")
      .order("created_at", { descending: true });

    if (error) {
      console.error("❌ Error fetching tendencies:", error);
      return;
    }

    allTendencies = data || [];
    document.getElementById("tendency-title").textContent = `🧭 All Tendencies (${allTendencies.length})`;
    renderTendencyTable(allTendencies);
  }

  function renderTendencyTable(list) {
    const tbody = document.getElementById("tendency-table-body");
    tbody.innerHTML = "";

    const start = (currentPage - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    const pageItems = list.slice(start, end);

    pageItems.forEach(t => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${t.tendency_id}</td>
<td><span class="tendency-badge" style="background-color: ${t.color || '#ccc'};">${t.name}</span></td>
        <td>${t.description || "-"}</td>
        <td>${dimensionMap[t.dimension_id] || "-"}</td>
        <td>${t.is_active ? "✅ Active" : "❌ Inactive"}</td>
        <td>
          <button class="action-btn action-edit" data-edit="${t.id}">✏️</button>
          <button class="action-btn action-delete" data-delete="${t.id}">🗑️</button>
        </td>
      `;
      tbody.appendChild(row);
    });

    renderPagination(list);

    tbody.querySelectorAll("button[data-edit]").forEach(btn =>
      btn.addEventListener("click", async (e) => {
        const id = e.target.getAttribute("data-edit");
        const { data } = await client.from("tendencies").select("*").eq("id", id).single();
        if (!data) return;

        currentEditId = id;
        document.getElementById("tendency-id").value = data.tendency_id;
        document.getElementById("tendency-name").value = data.name;
        document.getElementById("tendency-description").value = data.description;
        document.getElementById("dimension-select").value = data.dimension_id;
        document.getElementById("tendency-status").value = String(data.is_active);
        populateTendencyColorSelect(dimensionColorMap[data.dimension_id]);
        document.getElementById("tendency-color").value = data.color;
      })
    );

    tbody.querySelectorAll("button[data-delete]").forEach(btn => {
  btn.addEventListener("click", async (e) => {
    const id = e.target.getAttribute("data-delete");

    const warning = `⚠️ Deleting this tendency will also remove:
- All mappings from question options
- All assessment weight assignments
- All user assessment counts/scores

Proceed?`;

    const confirmed = confirm(warning);
    if (!confirmed) return;

    try {
      // Cleanup related mappings
      await client.from("question_option_tendencies").delete().eq("tendency_id", id);
      await client.from("assessment_tendency_weights").delete().eq("tendency_id", id);
      await client.from("user_tendency_counts").delete().eq("tendency_id", id);
      await client.from("assessment_scores").delete().eq("tendency_id", id);

      // Delete the actual tendency
      await client.from("tendencies").delete().eq("id", id);

      alert("✅ Tendency and related mappings deleted successfully.");
      await fetchAndDisplayTendencies();
    } catch (err) {
      console.error("❌ Delete failed:", err);
      alert("Deletion failed. Please check console for details.");
    }
  });
});

  }

  function renderPagination(list) {
    const totalPages = Math.ceil(list.length / rowsPerPage);
    const container = document.getElementById("pagination");
    if (!container) return;

    container.innerHTML = `
      <button ${currentPage === 1 ? "disabled" : ""} onclick="changeTendencyPage(${currentPage - 1})">◀ Prev</button>
      <span>Page ${currentPage} of ${totalPages}</span>
      <button ${currentPage === totalPages ? "disabled" : ""} onclick="changeTendencyPage(${currentPage + 1})">Next ❯</button>
    `;
  }

  window.changeTendencyPage = (page) => {
    currentPage = page;
    renderTendencyTable(allTendencies);
  };

  function exportTableToCSV() {
    const headers = ["Tendency ID", "Name", "Description", "Dimension", "Status"];
    const rows = allTendencies.map(t => [
      t.tendency_id,
      t.name,
      t.description || "-",
      dimensionMap[t.dimension_id] || "-",
      t.is_active ? "Active" : "Inactive"
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers, ...rows].map(e => e.join(",")).join("\n");
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", "solyte_tendencies.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  initTendenciesPage();
})();
