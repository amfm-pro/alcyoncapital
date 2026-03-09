const statusMessage = document.getElementById("status-message");
const loginForm = document.getElementById("login-form");

initLoginPage();

async function initLoginPage() {
  const api = window.SupabaseApi;

  if (!api?.isConfigReady || !api.isConfigReady()) {
    showStatus(api?.getConfigError?.() || "Configuration invalide.", true);
    return;
  }

  const user = await api.getAuthenticatedUser();
  if (user) {
    window.location.replace("app.html");
    return;
  }

  loginForm.addEventListener("submit", onLoginSubmit);
}

async function onLoginSubmit(event) {
  event.preventDefault();

  const email = loginForm.querySelector("#login-email").value.trim();
  const password = loginForm.querySelector("#login-password").value;

  const result = await window.SupabaseApi.loginWithPassword(email, password);

  if (result.error) {
    showStatus(`Connexion impossible: ${result.error}`, true);
    return;
  }

  showStatus("Connexion reussie. Redirection...", false);
  window.location.replace("app.html");
}

function showStatus(message, isError) {
  statusMessage.textContent = message;
  statusMessage.classList.toggle("status-error", isError);
}
