    (() => {
    let currentEditId = null;
    let currentPage = 1;
    const rowsPerPage = 7;
    let allCohorts = [];
    let allUsers = [];
    let emailMap = {};
    let cohortsInitialized = false;

    async function initCohortsPage() {
        if (cohortsInitialized) return;
        cohortsInitialized = true;

        await fetchUsers();
        await fetchAndDisplayCohorts();

        document.getElementById("cohort-form").addEventListener("submit", async (e) => {
        e.preventDefault();

        const form = e.target;
        const name = document.getElementById("name").value.trim();
        const description = document.getElementById("description").value.trim();
        const start_date = document.getElementById("start_date").value;
        const end_date = document.getElementById("end_date").value;
        const selectedUserIds = [...document.querySelectorAll(".user-checkbox:checked")].map(cb => cb.value);
        const admin = await client.auth.getUser();
        const created_by = admin.data.user?.id;

        if (currentEditId) {
            await client.from("cohorts").update({
            name, description, start_date, end_date
            }).eq("id", currentEditId);

            await client.from("cohort_members").delete().eq("cohort_id", currentEditId);

            if (selectedUserIds.length > 0) {
            const inserts = selectedUserIds.map(uid => ({ cohort_id: currentEditId, app_user_id: uid }));
            await client.from("cohort_members").insert(inserts);
            }

            showMessage(`✅ Cohort "${name}" updated successfully.`);
            currentEditId = null;
            form.reset();
            await fetchAndDisplayCohorts();
            return;
        }

        
        const { data: cohort, error } = await client
            .from("cohorts")
            .insert([{ name, description, start_date, end_date, created_by }])
            .select()
            .single();

        if (error) return alert("❌ Error creating cohort");

        if (selectedUserIds.length > 0) {
            const inserts = selectedUserIds.map(uid => ({ cohort_id: cohort.id, app_user_id: uid }));
            await client.from("cohort_members").insert(inserts);
        }

        showMessage(`✅ Cohort "${name}" created successfully.`);
        form.reset();
        await fetchAndDisplayCohorts();
        });

        document.getElementById("export-btn").addEventListener("click", exportToCSV);

        document.getElementById("search-input")?.addEventListener("input", function () {
    const keyword = this.value.trim().toLowerCase();
    const filtered = allCohorts.filter(c =>
        c.name.toLowerCase().includes(keyword)
    );
    currentPage = 1;
    renderCohortTable(filtered);
    });

    }

    async function fetchUsers() {
        const { data: users } = await client
        .from("app_users")
        .select("id, first_name, last_name, email, company_name");

        allUsers = users;

        const tbody = document.getElementById("user-checkbox-table");
        tbody.innerHTML = "";

        users.forEach(user => {
        const row = document.createElement("tr");
        row.innerHTML = `
            <td><input type="checkbox" class="user-checkbox" value="${user.id}" /></td>
            <td>${user.first_name} ${user.last_name}</td>
            <td>${user.email}</td>
            <td>${user.company_name || "-"}</td>
        `;
        tbody.appendChild(row);
        });

        const { data: roles } = await client.from("user_roles").select("supabase_user_id, email");
        roles.forEach(r => emailMap[r.supabase_user_id] = r.email);

        document.getElementById("user-search").addEventListener("input", (e) => {
        const keyword = e.target.value.toLowerCase();
        [...tbody.children].forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(keyword) ? "" : "none";
        });
        });

        // ✅ Select All checkbox logic
        const selectAllCheckbox = document.getElementById("select-all-users");
        if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener("change", function () {
            const checked = this.checked;
            document.querySelectorAll("#user-checkbox-table tr").forEach(row => {
            if (row.style.display !== "none") {
                const cb = row.querySelector("input.user-checkbox");
                if (cb) cb.checked = checked;
            }
            });
        });
        }
    }

    async function fetchAndDisplayCohorts() {
        const { data, error } = await client.from("cohorts").select("*").order("created_at", { ascending: false });
        if (error) return console.error("Error loading cohorts:", error);
        allCohorts = data;
        document.getElementById("cohort-title").textContent = `👥 All Cohorts (${allCohorts.length})`;
        renderCohortTable(allCohorts);
    }

        async function renderCohortTable(list) {
    const tbody = document.getElementById("cohort-table-body");
    tbody.innerHTML = "";
    const start = (currentPage - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    const pageItems = list.slice(start, end);

    for (const cohort of pageItems) {
        const { data: members } = await client.from("cohort_members").select("app_user_id").eq("cohort_id", cohort.id);
        const userCount = members?.length || 0;
        const creator = emailMap[cohort.created_by] || "-";

        const row = document.createElement("tr");
        row.innerHTML = `
        <td>${cohort.name}</td>
        <td>${cohort.start_date || "-"} to ${cohort.end_date || "-"}</td>
        <td><span class="${cohort.is_active ? "status-active" : "status-inactive"}">
    ${cohort.is_active ? "Active" : "Inactive"}
    </span></td>
        <td><span class="user-count-badge">${userCount}</span></td>
        <td>${creator}</td>
        <td>
            <button class="action-btn action-view"data-view="${cohort.id}">🔍</button>
            <button class="action-btn action-edit" data-edit="${cohort.id}">✏️</button>
            <button class="action-btn action-delete" data-delete="${cohort.id}">🗑️</button>
        </td>
        `;
        tbody.appendChild(row);
    }

    renderPagination(list);

    // ✏️ Edit Cohort
    tbody.querySelectorAll("button[data-edit]").forEach(btn => {
        btn.addEventListener("click", async e => {
        const id = e.target.getAttribute("data-edit");
        const cohort = allCohorts.find(c => c.id === id);
        if (!cohort) return;

        document.getElementById("name").value = cohort.name;
        document.getElementById("description").value = cohort.description || "";
        document.getElementById("start_date").value = cohort.start_date || "";
        document.getElementById("end_date").value = cohort.end_date || "";

        const { data: members } = await client.from("cohort_members").select("app_user_id").eq("cohort_id", id);
        const userIds = members.map(m => m.app_user_id);
        [...document.querySelectorAll(".user-checkbox")].forEach(cb => {
            cb.checked = userIds.includes(cb.value);
        });

        currentEditId = id;
        });
    });

    // 🗑️ Delete Cohort
    tbody.querySelectorAll("button[data-delete]").forEach(btn => {
        btn.addEventListener("click", async e => {
        const id = e.target.getAttribute("data-delete");
        const confirmed = confirm("Delete this cohort?");
        if (confirmed) {
            await client.from("cohort_members").delete().eq("cohort_id", id);
            await client.from("cohorts").delete().eq("id", id);
            await fetchAndDisplayCohorts();
        }
        });
    });

    // 🔍 View Users in Cohort
    tbody.querySelectorAll("button[data-view]").forEach(btn => {
    btn.addEventListener("click", async e => {
        const id = e.target.getAttribute("data-view");
        const { data: members } = await client.from("cohort_members").select("app_user_id").eq("cohort_id", id);

        if (!members || members.length === 0) {
        showMessage("No users in this cohort.");
        return;
        }

        const userIds = members.map(m => m.app_user_id);
        const { data: users } = await client
        .from("app_users")
        .select("first_name, last_name, email, company_name")
        .in("id", userIds);

        const modalList = document.getElementById("modal-user-list");
        modalList.innerHTML = users.map(u =>
        `<li>${u.first_name} ${u.last_name} (${u.email}) - ${u.company_name || "-"}</li>`
        ).join("");

        const cohort = allCohorts.find(c => c.id === id);
        const cohortName = cohort?.name || "Unnamed";
        document.getElementById("modal-title").textContent = `👥 ${users.length} Users in "${cohortName}"`;
        document.getElementById("user-modal").style.display = "flex";
    });
    });

    // Modal Close
    const modalCloseBtn = document.getElementById("modal-close");
    if (modalCloseBtn) {
        modalCloseBtn.onclick = () => {
        document.getElementById("user-modal").style.display = "none";
        };
    }
    }


        function renderPagination(list) {
            const container = document.getElementById("pagination");
            const totalPages = Math.ceil(list.length / rowsPerPage);
            container.innerHTML = `
            <button ${currentPage === 1 ? "disabled" : ""} onclick="changeCohortPage(${currentPage - 1})"> ◄ Prev</button>
            <span> Page ${currentPage} of ${totalPages} </span>
            <button ${currentPage === totalPages ? "disabled" : ""} onclick="changeCohortPage(${currentPage + 1})">Next ❯ </button>
            `;
        }

        window.changeCohortPage = (page) => {
            currentPage = page;
            renderCohortTable(allCohorts);
        };

        async function exportToCSV() {
    const headers = ["Cohort Name", "Start Date", "End Date", "Active", "Created By", "User Name", "Email"];
    const rows = [];

    for (const cohort of allCohorts) {
        const { data: members } = await client
        .from("cohort_members")
        .select("app_user_id")
        .eq("cohort_id", cohort.id);

        const userIds = members.map(m => m.app_user_id);

        const { data: users } = await client
        .from("app_users")
        .select("first_name, last_name, email")
        .in("id", userIds);

        const createdByEmail = emailMap[cohort.created_by] || "-";

        if (users && users.length > 0) {
        users.forEach(u => {
            rows.push([
            cohort.name,
            cohort.start_date || "-",
            cohort.end_date || "-",
            cohort.is_active ? "Yes" : "No",
            createdByEmail,
            `${u.first_name} ${u.last_name}`,
            u.email
            ]);
        });
        } else {
        // If no users, still include the cohort info with blanks
        rows.push([
            cohort.name,
            cohort.start_date || "-",
            cohort.end_date || "-",
            cohort.is_active ? "Yes" : "No",
            createdByEmail,
            "-",
            "-"
        ]);
        }
    }

    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "cohorts_users_detailed.csv";
    link.click();
    }


        initCohortsPage();
        })();

    function showMessage(msg) {
    const box = document.createElement("div");
    box.className = "toast-message";

    const closeBtn = document.createElement("span");
    closeBtn.innerHTML = "&times;";
    closeBtn.className = "toast-close";
    closeBtn.onclick = () => box.remove();

    const text = document.createElement("span");
    text.textContent = msg;

    box.appendChild(text);
    box.appendChild(closeBtn);
    document.body.appendChild(box);

    void box.offsetWidth;
    box.classList.add("show");

    setTimeout(() => {
        if (document.body.contains(box)) {
        box.classList.remove("show");
        setTimeout(() => box.remove(), 400);
        }
    }, 3000);
    }
