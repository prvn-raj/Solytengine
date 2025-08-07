(async () => {
  let currentEditId = null;
  let allDimensions = [];
  let emailMap = {};
  let currentPage = 1;
  const rowsPerPage = 7;

  async function initDimensionsPage() {
    const form = document.getElementById("dimension-form");
    const exportBtn = document.getElementById("export-btn");

    if (!form) return;

    await populateNextDimensionId();
    await fetchUsers();
    await fetchAndDisplayDimensions();

    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      const dimension_id = document.getElementById("dimension-id").value.trim();
      const name = document.getElementById("dimension-name").value.trim();
      const description = document.getElementById("dimension-description").value.trim();
      const color = document.getElementById("dimension-color").value.trim();

      const admin = await client.auth.getUser();
      const createdBy = admin.data.user?.id;

      if (!name || !color || !createdBy) {
        alert("Name, Color, and User session are required.");
        return;
      }

      try {
        if (currentEditId) {
          const { error } = await client
            .from("dimensions")
            .update({ name, description, color })
            .eq("id", currentEditId);

          if (error) throw error;
          currentEditId = null;
        } else {
          const payload = {
            dimension_id,
            name,
            description,
            color,
            created_by: createdBy
          };

          const { error } = await client.from("dimensions").insert([payload]);
          if (error) throw error;

          await populateNextDimensionId();
        }

        form.reset();
        await populateNextDimensionId();  // ✅ force re-population
        await fetchAndDisplayDimensions();
      } catch (error) {
        console.error("❌ Submission failed:", error);
        alert("Submission failed. Ensure name and ID are unique.");
      }
    });

    if (exportBtn) {
      exportBtn.addEventListener("click", exportTableToCSV);
    }
  }

  async function fetchUsers() {
    const { data, error } = await client
      .from("user_roles")
      .select("supabase_user_id, email");

    if (error) {
      console.error("❌ Failed to fetch users:", error);
      return;
    }

    emailMap = {};
    data.forEach(u => {
      emailMap[u.supabase_user_id] = u.email;
    });
  }

  async function populateNextDimensionId() {
    const { data, error } = await client
      .from("dimensions")
      .select("dimension_id")
      .order("created_at", { ascending: false })
      .limit(1000);

    let maxNum = 0;

    if (data && data.length > 0) {
      data.forEach(d => {
        const match = d.dimension_id?.match(/SOLDIM-(\d+)/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (!isNaN(num) && num > maxNum) {
            maxNum = num;
          }
        }
      });
    }

    const nextId = "SOLDIM-" + String(maxNum + 1).padStart(3, "0");
    document.getElementById("dimension-id").value = nextId;
  }

  async function fetchAndDisplayDimensions() {
    const { data, error } = await client
      .from("dimensions")
      .select("*")
      .order("created_at", { descending: true });

    if (error) {
      console.error("❌ Fetch error:", error);
      return;
    }

    allDimensions = data || [];
    document.getElementById("dimension-title").textContent = `🧠 All Dimensions (${allDimensions.length})`;
    renderDimensionTable(allDimensions);
  }

  function renderDimensionTable(list) {
    const tbody = document.getElementById("dimension-table-body");
    tbody.innerHTML = "";

    const start = (currentPage - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    const pageItems = list.slice(start, end);

    pageItems.forEach(dim => {
      const creatorEmail = emailMap[dim.created_by] || "-";
      const colorSwatch = `<span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:${dim.color};margin-right:6px;vertical-align:middle;"></span>`;
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${dim.dimension_id}</td>    
        <td>
    <span style="
      display: inline-block;
      background-color: ${dim.color};
      color: #fff;
      padding: 4px 10px;
      border-radius: 20px;
      font-size: 13px;
      font-weight: 400;
      font-family: 'Lexend', sans-serif;
    ">${dim.name}</span>
  </td>
        <td>${dim.description || "-"}</td>
        <td>${creatorEmail}</td>
        <td>
          <button class="action-btn action-edit" data-edit="${dim.id}">✏️</button>
          <button class="action-btn action-delete" data-delete="${dim.id}">🗑️</button>
        </td>
      `;
      tbody.appendChild(row);
    });

    renderPagination(list);

    tbody.querySelectorAll("button[data-edit]").forEach(btn =>
      btn.addEventListener("click", async (e) => {
        const id = e.target.getAttribute("data-edit");
        const { data, error } = await client.from("dimensions").select("*").eq("id", id).single();
        if (error) return;

        currentEditId = id;
        document.getElementById("dimension-id").value = data.dimension_id;
        document.getElementById("dimension-name").value = data.name;
        document.getElementById("dimension-description").value = data.description;
        document.getElementById("dimension-color").value = data.color || "#E67E22";
      })
    );

    tbody.querySelectorAll("button[data-delete]").forEach(btn =>
  btn.addEventListener("click", async (e) => {
    const id = e.target.getAttribute("data-delete");

    const warning = `⚠️ This dimension may be linked to existing tendencies or assessments.
If linked, deletion is not allowed to maintain data integrity.

Do you want to proceed with safety check?`;

    const confirmed = confirm(warning);
    if (!confirmed) return;

    try {
      // Check if any tendencies exist using this dimension
      const { count, error } = await client
        .from("tendencies")
        .select("*", { count: "exact", head: true })
        .eq("dimension_id", id);

      if (count > 0) {
        alert("❌ This dimension is in use and cannot be deleted. Please contact Tech Overlord.");
        return;
      }

      // Safe to delete
      await client.from("dimensions").delete().eq("id", id);
      alert("✅ Dimension deleted successfully.");
      await fetchAndDisplayDimensions();
    } catch (err) {
      console.error("❌ Delete failed:", err);
      alert("Deletion failed. Please check console for errors.");
    }
  })
);

  }

  function renderPagination(list) {
    const totalPages = Math.ceil(list.length / rowsPerPage);
    const container = document.getElementById("pagination");
    if (!container) return;

    container.innerHTML = `
      <button ${currentPage === 1 ? "disabled" : ""} onclick="changeDimensionPage(${currentPage - 1})">◀ Prev</button>
      <span>Page ${currentPage} of ${totalPages}</span>
      <button ${currentPage === totalPages ? "disabled" : ""} onclick="changeDimensionPage(${currentPage + 1})">Next ❯</button>
    `;
  }

  window.changeDimensionPage = (page) => {
    currentPage = page;
    renderDimensionTable(allDimensions);
  };

  function exportTableToCSV() {
    const headers = ["Dimension ID", "Name", "Description", "Created By"];
    const rows = allDimensions.map(dim => [
      dim.dimension_id,
      dim.name,
      dim.description || "-",
      emailMap[dim.created_by] || "-"
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers, ...rows].map(e => e.join(",")).join("\n");
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", "solyte_dimensions.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
  window.initDimensionsPage = initDimensionsPage;

  await initDimensionsPage();


})();
