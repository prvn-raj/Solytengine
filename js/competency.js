

document.addEventListener("DOMContentLoaded", async () => {
  await loadCompetencies();

  document.getElementById("competency-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("name").value.trim();
    const description = document.getElementById("description").value.trim();
    const category = document.getElementById("category").value.trim();

    const { error } = await client.from("competencies").insert([{ name, description, category }]);
    if (error) {
      alert("❌ Error adding competency");
      console.error(error);
    } else {
      e.target.reset();
      await loadCompetencies();
    }
  });

  document.getElementById("export-btn").addEventListener("click", exportToCSV);
});

async function loadCompetencies() {
  const tableBody = document.getElementById("competency-table-body");
  tableBody.innerHTML = "";

  const { data, error } = await client.from("competencies").select("*").order("created_at", { ascending: false });
  if (error) {
    console.error("Error loading competencies:", error);
    return;
  }

  data.forEach((comp) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${comp.name}</td>
      <td>${comp.category}</td>
      <td>${comp.description}</td>
      <td><button class="delete-btn" data-id="${comp.id}">Delete</button></td>
    `;
    tableBody.appendChild(row);
  });
}


function exportToCSV() {
  const rows = [...document.querySelectorAll("#competencies-table tr")];
  const csv = rows
    .map((row) => [...row.children].map((cell) => `"${cell.innerText}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "competencies.csv";
  link.click();
}
