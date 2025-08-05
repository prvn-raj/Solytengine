const client = supabase.createClient(
  "https://gpajaajgjqjfmqkgkccv.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdwYWphYWpnanFqZm1xa2drY2N2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA0MzYyNTUsImV4cCI6MjA2NjAxMjI1NX0.kMRIatwFV6BgFADJccakiabah3zszCWYxB6sZMSggp8"
);

document.getElementById("change-password-form").addEventListener("submit", async (e) => {
  e.preventDefault();

  const newPassword = document.getElementById("new-password").value;
  const statusMsg = document.getElementById("status-message");

  const { data, error } = await client.auth.updateUser({ password: newPassword });

  if (error) {
    statusMsg.textContent = `❌ ${error.message}`;
    statusMsg.classList.remove("hidden");
    return;
  }

  const user = (await client.auth.getUser()).data.user;

  const { error: dbUpdateError } = await client
    .from("app_users")
    .update({ initial_password: null })
    .eq("supabase_user_id", user.id);

  if (!dbUpdateError) {
    statusMsg.textContent = "✅ Password updated! Redirecting to login...";
    statusMsg.classList.remove("hidden");
    statusMsg.style.color = "green";

    setTimeout(async () => {
      await client.auth.signOut();
      window.location.href = "index.html";
    }, 2000);
  }
});
