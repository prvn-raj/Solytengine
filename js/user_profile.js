(async () => {
  const userRes = await client.auth.getUser();
  const userId = userRes.data.user.id;

  const { data: profile, error } = await client
    .from("app_users")
    .select(`
      user_id,
      first_name,
      last_name,
      email,
      phone,
      company_name,
      department,
      designation,
      employee_id,
      date_of_birth,
      is_active,
      created_at,
      updated_at
    `)
    .eq("supabase_user_id", userId)
    .single();

  if (error || !profile) return;

  const fullName = `${profile.first_name} ${profile.last_name}`;
document.getElementById("profile-full-name").textContent = `✨ ${fullName}`;

// Set initials in avatar
  const initials = `${profile.first_name[0]}${profile.last_name[0]}`.toUpperCase();
document.querySelector(".avatar-circle").textContent = initials;


  const formatDate = (d) => d ? new Date(d).toLocaleDateString() : "-";

  document.getElementById("profile-user-id").textContent = profile.user_id;
  document.getElementById("profile-name").textContent = `${profile.first_name} ${profile.last_name}`;
  document.getElementById("profile-email").textContent = profile.email;
  document.getElementById("profile-phone").textContent = profile.phone || "-";
  document.getElementById("profile-company").textContent = profile.company_name || "-";
  document.getElementById("profile-department").textContent = profile.department || "-";
  document.getElementById("profile-designation").textContent = profile.designation || "-";
  document.getElementById("profile-employee-id").textContent = profile.employee_id || "-";
  document.getElementById("profile-dob").textContent = formatDate(profile.date_of_birth);
  document.getElementById("profile-status").textContent = profile.is_active ? "✅ Active" : "⛔ Inactive";
  document.getElementById("profile-created-at").textContent = formatDate(profile.created_at);
  document.getElementById("profile-updated-at").textContent = formatDate(profile.updated_at);
})();
