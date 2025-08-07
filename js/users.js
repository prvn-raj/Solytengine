(() => {
  let currentEditId = null;
  let currentPage = 1;
  const rowsPerPage = 7;
  let allUsers = [];
  let emailMap = {};

  async function initUsersPage() {
    const form = document.getElementById("user-form");
    const userIdField = document.getElementById("user_id");
    const exportBtn = document.getElementById("export-btn");
    const searchInput = document.getElementById("search-input");

    if (!form || !userIdField) return;

    await populateNextUserId();
    await fetchAndDisplayUsers();

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const userData = {
        user_id: userIdField.value.trim(),
        first_name: document.getElementById("first_name").value.trim(),
        last_name: document.getElementById("last_name").value.trim(),
        email: document.getElementById("email").value.trim(),
        phone: document.getElementById("phone").value.trim() || null,
        department: document.getElementById("department").value.trim() || null,
        designation: document.getElementById("designation").value.trim() || null,
        employee_id: document.getElementById("employee_id").value.trim() || null,
        date_of_birth: document.getElementById("date_of_birth").value || null,
        company_name: document.getElementById("company_name").value.trim() || null,
      };

      const admin = await client.auth.getUser();
      userData.created_by = admin.data.user?.id;

      if (currentEditId) {
        await client.from("app_users").update(userData).eq("id", currentEditId);
        currentEditId = null;
      } else {
        userData.initial_password = "pending";
        await client.from("app_users").insert([userData]);
      }

      e.target.reset();
      await populateNextUserId();
      await fetchAndDisplayUsers();
    });

    if (exportBtn) {
      exportBtn.addEventListener("click", exportTableToCSV);
    }

    if (searchInput) {
      searchInput.addEventListener("input", () => {
        const keyword = searchInput.value.trim().toLowerCase();
        const filtered = allUsers.filter(user =>
          `${user.first_name} ${user.last_name}`.toLowerCase().includes(keyword) ||
          user.email?.toLowerCase().includes(keyword) ||
          user.user_id?.toLowerCase().includes(keyword) ||
          user.company_name?.toLowerCase().includes(keyword)
        );
        renderUserTable(filtered);
      });
    }
  }

  async function fetchAndDisplayUsers() {
    const { data: users, error: userError } = await client
      .from("app_users")
      .select("*")
      .order("created_at", { ascending: false });

    if (userError) return console.error("Error fetching users:", userError);
    allUsers = users;

    const { data: roles, error: roleError } = await client
      .from("user_roles")
      .select("supabase_user_id, email");

    if (roleError) return console.error("Error fetching creator emails:", roleError);

    emailMap = {};
    roles.forEach(r => {
      if (r.supabase_user_id) emailMap[r.supabase_user_id] = r.email;
    });
    document.getElementById("user-title").textContent = `👤 All Users (${allUsers.length})`;
        renderUserTable(allUsers);
  }

  function renderUserTable(userList) {
    const table = document.getElementById("user-table-body");
    table.innerHTML = "";

    const start = (currentPage - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    const pageUsers = userList.slice(start, end);

    pageUsers.forEach(user => {
      const creatorEmail = emailMap[user.created_by] || "-";
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${user.user_id}</td>
        <td>${user.first_name} ${user.last_name}</td>
        <td>${user.email}</td>
        <td>${user.company_name || "-"}</td>
        <td>${user.designation || "-"}</td>
        <td>${user.employee_id || "-"}</td>
        <td class="${user.is_auth_complete ? 'status-complete' : 'status-pending'}">
          ${user.is_auth_complete ? "✔️ Completed" : "⏳ Pending"}
        </td>
        <td>
          ${user.initial_password === "pending"
            ? "🕒 Waiting for Admin"
            : user.initial_password ?? "🔒 Locked"}
        </td>
        <td>${creatorEmail}</td>
        <td>
          <button class="action-btn action-edit" data-edit="${user.id}">✏️</button>
          <button class="action-btn action-delete" data-delete="${user.id}">🗑️</button>
        </td>
      `;
      table.appendChild(row);
    });

    renderPagination(userList);

    table.querySelectorAll("button[data-edit]").forEach(btn =>
      btn.addEventListener("click", async (e) => {
        const id = e.target.getAttribute("data-edit");
        const { data, error } = await client.from("app_users").select("*").eq("id", id).single();
        if (error) return console.error("Error fetching for edit:", error);
        currentEditId = id;

        document.getElementById("user_id").value = data.user_id;
        document.getElementById("first_name").value = data.first_name;
        document.getElementById("last_name").value = data.last_name;
        document.getElementById("email").value = data.email;
        document.getElementById("phone").value = data.phone;
        document.getElementById("department").value = data.department;
        document.getElementById("designation").value = data.designation;
        document.getElementById("company_name").value = data.company_name || "";
        document.getElementById("employee_id").value = data.employee_id;
        document.getElementById("date_of_birth").value = data.date_of_birth ?? "";
      })
    );

    table.querySelectorAll("button[data-delete]").forEach(btn =>
      btn.addEventListener("click", async (e) => {
        const id = e.target.getAttribute("data-delete");
        const confirmed = confirm("Delete this user?");
        if (confirmed) {
          await client.from("app_users").delete().eq("id", id);
          await fetchAndDisplayUsers();
        }
      })
    );
  }

  function renderPagination(userList) {
    const totalPages = Math.ceil(userList.length / rowsPerPage);
    const container = document.getElementById("pagination");
    if (!container) return;

    container.innerHTML = `
      <button ${currentPage === 1 ? "disabled" : ""} onclick="changeUserPage(${currentPage - 1})"> ◀ Prev</button>
      <span> Page ${currentPage} of ${totalPages} </span>
      <button ${currentPage === totalPages ? "disabled" : ""} onclick="changeUserPage(${currentPage + 1})">Next ❯  </button>
    `;
  }

  window.changeUserPage = (page) => {
    currentPage = page;
    renderUserTable(allUsers);
  };

  function exportTableToCSV() {
    const headers = ["User ID", "Name", "Email", "Company", "Designation", "Employee ID", "Status", "Initial Password", "Created By"];
    const rows = allUsers.map(user => [
      user.user_id,
      `${user.first_name} ${user.last_name}`,
      user.email,
      user.company_name || "-",
      user.designation || "-",
      user.employee_id || "-",
      user.is_auth_complete ? "Completed" : "Pending",
      user.initial_password ?? "Locked",
      user.created_by
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers, ...rows].map(e => e.join(",")).join("\n");
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", "solyte_users.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  async function populateNextUserId() {
    const { data, error } = await client
      .from("app_users")
      .select("user_id")
      .order("user_id", { descending: true })
      .limit(1000);

    let maxId = 0;
    if (data && data.length > 0) {
      data.forEach(entry => {
        const num = parseInt(entry.user_id, 10);
        if (!isNaN(num) && num > maxId) {
          maxId = num;
        }
      });
    }

    const nextId = (maxId + 1).toString().padStart(7, "0");
    const field = document.getElementById("user_id");
    if (field) field.value = nextId;
  }
window.initUsersPage = initUsersPage;

  initUsersPage();
})();



