

document.getElementById("login-form").addEventListener("submit", async function (e) {
  e.preventDefault();

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  // 🔐 Sign in via Supabase Auth
  const { data, error } = await client.auth.signInWithPassword({ email, password });

  if (error) {
    document.getElementById("error-message").textContent = error.message;
    document.getElementById("error-message").classList.remove("hidden");
    return;
  }

  const userId = data.user.id;

  // 🔍 Try to fetch the role from user_roles
  const { data: roleData, error: roleError } = await client
    .from("user_roles")
    .select("role")
    .eq("supabase_user_id", userId)
    .maybeSingle();

  // 🎯 Role-based redirection
  if (roleData && roleData.role) {
    if (roleData.role === "admin" || roleData.role === "super_admin") {
      window.location.href = "admin_dashboard.html";
    } else {
      document.getElementById("error-message").textContent = "Unauthorized role.";
      document.getElementById("error-message").classList.remove("hidden");
    }
  } else {
    // 🧠 No role assigned, treat as app_user
    const { data: profile, error: profileError } = await client
      .from("app_users")
      .select("initial_password")
      .eq("supabase_user_id", userId)
      .maybeSingle();

    if (profileError || !profile) {
      document.getElementById("error-message").textContent = "Profile not found.";
      document.getElementById("error-message").classList.remove("hidden");
      return;
    }

    if (profile.initial_password) {
      // 🔐 Force password change
      window.location.href = "change_password.html";
    } else {
      // ✅ Go to dashboard
      window.location.href = "user_dashboard.html";
    }
  }
});
document.getElementById("forgot-password-link").addEventListener("click", (e) => {
  e.preventDefault();
  alert("Please contact your administrator to reset your password.");
});
