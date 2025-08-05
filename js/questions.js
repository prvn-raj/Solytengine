(() => {
  let allTendencies = [];
  let currentOptions = [];
  let currentEditId = null;
  let allQuestions = [];
  let currentPage = 1;
  const rowsPerPage = 7;
  let sortAsc = true;
let currentSortField = 'question_id';


  async function initQuestionsPage() {
    await populateDimensionDropdown();
    await fetchTendencies();
    await populateNextQuestionId();
    await loadQuestions();
    


    const form = document.getElementById("question-form");
    const addOptionBtn = document.getElementById("add-option-btn");
    const questionTypeField = document.getElementById("question_type");
    const searchInput = document.getElementById("search-input");
    const exportBtn = document.getElementById("export-btn");

    addOptionBtn.addEventListener("click", () => {
      const type = questionTypeField.value;
      if (!type) return alert("Please select a question type first");
      if (type === "true_false" && currentOptions.length >= 2) return alert("True/False can only have 2 options");

      if (currentOptions.length > 0) {
        const last = currentOptions[currentOptions.length - 1];
        const text = last.valueInput.value.trim();
        const mapped =
          last.competencySelect.selectedOptions.length > 0 ||
          last.cortexSelect.selectedOptions.length > 0 ||
          last.influencesSelect.selectedOptions.length > 0;

        if (!text || !mapped) {
          alert("Please complete the last option with a value and at least one tendency before adding a new one.");
          return;
        }
      }

      addOptionBlock(type);
    });

    questionTypeField.addEventListener("change", () => {
      document.getElementById("options-container").innerHTML = "";
      currentOptions = [];
    });

    if (searchInput) {
      searchInput.addEventListener("input", () => {
        const keyword = searchInput.value.trim().toLowerCase();
        const filtered = allQuestions.filter(q =>
          q.question_text.toLowerCase().includes(keyword) ||
          (q.dimension_type || "").toLowerCase().includes(keyword)
        );
        renderQuestionTable(filtered);
      });
    }

    if (exportBtn) {
      exportBtn.addEventListener("click", exportTableToCSV);
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      const text = document.getElementById("question_text").value.trim();
      const dimension = document.getElementById("dimension").value;
      const difficulty = parseInt(document.getElementById("difficulty").value);
      const type = document.getElementById("question_type").value;
      const questionId = document.getElementById("question_id")?.value || "";

      if (!text || !dimension || !difficulty || !type) {
        alert("Please fill all mandatory fields.");
        return;
      }

      if (currentOptions.length === 0) {
        alert("Please add at least one option.");
        return;
      }

      for (const opt of currentOptions) {
        const optionText = opt.valueInput.value.trim();
        const hasTendencies =
          opt.competencySelect.selectedOptions.length > 0 ||
          opt.cortexSelect.selectedOptions.length > 0 ||
          opt.influencesSelect.selectedOptions.length > 0;

        if (!optionText || !hasTendencies) {
          alert("Each option must have a label and be mapped to at least one tendency.");
          return;
        }
      }

      const admin = await client.auth.getUser();
      const created_by = admin.data.user.id;

      let questionData = {
        question_text: text,
        question_type: type,
        difficulty_level: difficulty,
        created_by,
        dimension_type: dimension
      };

      if (questionId) questionData.question_id = questionId;

      let inserted;
      if (currentEditId) {
        const { data, error } = await client
          .from("questions")
          .update(questionData)
          .eq("id", currentEditId)
          .select()
          .single();

        if (error) {
          alert("Error updating question");
          console.error(error);
          return;
        }
        inserted = data;

        await client.from("question_option_tendencies").delete().eq("question_id", currentEditId);
        currentEditId = null;
      } else {
        const { data, error } = await client
          .from("questions")
          .insert([questionData])
          .select()
          .single();

        if (error) {
          alert("Error saving question");
          console.error(error);
          return;
        }
        inserted = data;
      }

      for (const opt of currentOptions) {
        const { valueInput, competencySelect, cortexSelect, influencesSelect } = opt;

        const optionText = valueInput.value.trim();
        if (!optionText) continue;

        const tendencies = [
          ...Array.from(competencySelect.selectedOptions).map(o => ({ tendency_id: o.value, dimension: "Competency" })),
          ...Array.from(cortexSelect.selectedOptions).map(o => ({ tendency_id: o.value, dimension: "Cortex" })),
          ...Array.from(influencesSelect.selectedOptions).map(o => ({ tendency_id: o.value, dimension: "Influences" })),
        ];

        for (const map of tendencies) {
          await client.from("question_option_tendencies").insert({
            question_id: inserted.id,
            option_value: optionText,
            tendency_id: map.tendency_id,
            dimension_id: getDimensionId(map.tendency_id),
            weight: 1
          });
        }
      }

      form.reset();
      document.getElementById("options-container").innerHTML = "";
      currentOptions = [];
      await populateNextQuestionId();
      await loadQuestions();
    });
  }

  document.getElementById("sort-id").addEventListener("click", () => {
  sortAsc = !sortAsc;
  currentSortField = 'question_id';
  sortQuestions();
});

function sortQuestions() {
  const sorted = [...allQuestions].sort((a, b) => {
    const valA = a[currentSortField] || "";
    const valB = b[currentSortField] || "";
    return sortAsc
      ? valA.localeCompare(valB, undefined, { numeric: true })
      : valB.localeCompare(valA, undefined, { numeric: true });
  });
  renderQuestionTable(sorted);
}

  async function fetchTendencies() {
    const { data, error } = await client
      .from("tendencies")
      .select("id, name, dimension_id, color, is_active, dimensions(name)")
      .eq("is_active", true);

    if (error) {
      console.error("Failed to fetch tendencies:", error);
      return;
    }

    allTendencies = data;
  }

  function addOptionBlock(type) {
    const container = document.getElementById("options-container");

    const block = document.createElement("div");
    block.classList.add("option-block");

    const valueInput = document.createElement("input");
    valueInput.type = "text";
    valueInput.placeholder = "Answer Option";
    valueInput.classList.add("option-input");

    if (type === "true_false") {
      valueInput.value = currentOptions.length === 0 ? "True" : "False";
      valueInput.readOnly = true;
    }

    block.appendChild(valueInput);

    const mapping = document.createElement("div");
    mapping.classList.add("tendency-mapping");

    const competencySelect = createMultiSelect("competency");
    const cortexSelect = createMultiSelect("cortex");
    const influencesSelect = createMultiSelect("influences");

    mapping.appendChild(competencySelect);
    mapping.appendChild(cortexSelect);
    mapping.appendChild(influencesSelect);
    block.appendChild(mapping);

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.textContent = "❌ Remove Option";
    removeBtn.className = "remove-option-btn";
    removeBtn.onclick = () => {
      container.removeChild(block);
      currentOptions = currentOptions.filter(o => o.block !== block);
    };
    block.appendChild(removeBtn);

    container.appendChild(block);
    currentOptions.push({ block, valueInput, competencySelect, cortexSelect, influencesSelect });
  }

  function createMultiSelect(dimensionKey) {
    const select = document.createElement("select");
    select.multiple = true;
    select.title = dimensionKey;

    const dimensionMap = {
      competency: "Competency",
      cortex: "Cortex",
      influences: "Influences"
    };

    const filtered = allTendencies.filter(
      t => t.dimensions?.name === dimensionMap[dimensionKey]
    );

    filtered.forEach(t => {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = t.name;
      select.appendChild(opt);
    });

    return select;
  }

  function getDimensionId(tendencyId) {
    const tendency = allTendencies.find(t => t.id === tendencyId);
    return tendency?.dimension_id || null;
  }

  async function populateNextQuestionId() {
    const idField = document.getElementById("question_id");
    if (!idField) return;

    const { data, error } = await client
      .from("questions")
      .select("question_id")
      .order("created_at", { ascending: false })
      .limit(1);

    let nextId = "SOLBEH-001";
    if (data && data.length > 0 && data[0].question_id) {
      const last = data[0].question_id;
      const num = parseInt(last.split("-")[1]) + 1;
      nextId = `SOLBEH-${String(num).padStart(3, "0")}`;
    }
    idField.value = nextId;
  }

  async function loadQuestions() {
    const { data, error } = await client
      .from("questions")
      .select("id, question_id, question_text, question_type, dimension_type, difficulty_level")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to load questions:", error);
      return;
    }

    allQuestions = data;
    document.getElementById("question-title").textContent = `🧠 All Questions (${allQuestions.length})`;

    renderQuestionTable(allQuestions);
  }

  function renderQuestionTable(dataList) {
    const table = document.getElementById("question-table-body");
    table.innerHTML = "";

    const start = (currentPage - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    const pageItems = dataList.slice(start, end);

    pageItems.forEach(q => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${q.question_id || "-"}</td>
        <td>${q.question_text}</td>
        <td>${q.question_type}</td>
        <td>${q.dimension_type || "-"}</td>
        <td>${q.difficulty_level}</td>
        <td>
          <button class="action-btn action-view" data-id="${q.id}">🔍</button>
          <button class="action-btn action-edit" data-id="${q.id}">✏️</button>
          <button class="action-btn action-delete" data-id="${q.id}">🗑️</button>
        </td>
      `;

     row.querySelector(".action-delete").onclick = async () => {
  if (!confirm("Are you sure you want to delete this question?")) return;

  try {
    // Step 1: delete related mappings
    await client.from("question_option_tendencies").delete().eq("question_id", q.id);
    await client.from("question_tendency_mappings").delete().eq("question_id", q.id);

    // Step 2: delete the question
    const { error } = await client.from("questions").delete().eq("id", q.id);
    if (error) throw error;

    await loadQuestions();
  } catch (err) {
    console.error("Failed to delete question:", err);
    alert("Delete failed due to linked data or DB constraint.");
  }
};


      row.querySelector(".action-edit").onclick = async () => {
        const form = document.getElementById("question-form");
        form.reset();
        document.getElementById("question_text").value = q.question_text;
        document.getElementById("question_type").value = q.question_type;
        document.getElementById("difficulty").value = q.difficulty_level;
        document.getElementById("dimension").value = q.dimension_type;
        document.getElementById("question_id").value = q.question_id;
        currentEditId = q.id;
        document.getElementById("options-container").innerHTML = "";
        currentOptions = [];
      };

      row.querySelector(".action-view").onclick = async () => {
  const tendencies = await getTendenciesForQuestion(q.id);
  const modal = document.getElementById("tendency-modal");
  const title = document.getElementById("tendency-modal-title");
  const badgeContainer = document.getElementById("tendency-badges");

  title.textContent = `Tendencies for ${q.question_id}`;
  badgeContainer.innerHTML = "";

  if (tendencies.length === 0) {
    badgeContainer.innerHTML = "<em>No tendencies found.</em>";
  } else {
    tendencies.forEach(t => {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.style.background = t.color;
      badge.textContent = `${t.name} (${t.dimensions.name})`;
      badgeContainer.appendChild(badge);
    });
  }

  modal.style.display = "block";
};


      table.appendChild(row);
    });

    renderPagination(dataList);
  }

  function renderPagination(dataList) {
    const totalPages = Math.ceil(dataList.length / rowsPerPage);
    const container = document.getElementById("pagination");
    if (!container) return;

    container.innerHTML = `
      <button ${currentPage === 1 ? "disabled" : ""} onclick="changeQuestionPage(${currentPage - 1})">◀ Prev</button>
      <span> Page ${currentPage} of ${totalPages} </span>
      <button ${currentPage === totalPages ? "disabled" : ""} onclick="changeQuestionPage(${currentPage + 1})">Next ❯</button>
    `;
  }
async function getTendenciesForQuestion(questionId) {
  const { data, error } = await client
    .from("question_option_tendencies")
    .select("tendencies(name, dimensions(name), color)")
    .eq("question_id", questionId);

  if (error) {
    console.error("Error loading tendencies:", error);
    return [];
  }

  return data.map(d => d.tendencies);
}

  async function exportTableToCSV() {
    const headers = ["Question ID", "Text", "Type", "Dimension", "Difficulty", "Tendencies"];
    const rows = await Promise.all(allQuestions.map(async q => {
      const tendencies = await getTendenciesForQuestion(q.id);
      const tendencyLabels = tendencies.map(t => `${t.name} (${t.dimensions.name})`).join("; ");
      return [
        q.question_id || "-",
        q.question_text,
        q.question_type,
        q.dimension_type || "-",
        q.difficulty_level,
        tendencyLabels
      ];
    }));

    const csvContent = "data:text/csv;charset=utf-8," + [headers, ...rows].map(e => e.join(",")).join("\n");
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", "questions.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  window.changeQuestionPage = (page) => {
    currentPage = page;
    renderQuestionTable(allQuestions);
  };

  initQuestionsPage();
})();

document.getElementById("tendency-modal-close").onclick = () => {
  document.getElementById("tendency-modal").style.display = "none";
};

window.onclick = (event) => {
  const modal = document.getElementById("tendency-modal");
  if (event.target === modal) {
    modal.style.display = "none";
  }
};

async function populateDimensionDropdown() {
  const dropdown = document.getElementById("dimension");
  if (!dropdown) return;

  dropdown.innerHTML = `<option value="">Select Dimension</option>`;

  const { data, error } = await client
    .from("dimensions")
    .select("name, color")
    .order("name", { ascending: true });

  if (error) {
    console.error("Failed to fetch dimensions:", error);
    return;
  }

  (data || []).forEach(dim => {
    const opt = document.createElement("option");
    opt.value = dim.name.toLowerCase(); // to match `dimension_type`
    opt.textContent = dim.name;
    opt.style.backgroundColor = dim.color || "#eee";
    opt.style.color = "#000";
    dropdown.appendChild(opt);
  });
}

