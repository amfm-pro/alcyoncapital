initRouterPage();

async function initRouterPage() {
  const statusMessage = document.getElementById("route-status");
  const api = window.SupabaseApi;

  if (!api?.isConfigReady || !api.isConfigReady()) {
    statusMessage.textContent = api?.getConfigError?.() || "Configuration invalide.";
    statusMessage.classList.add("status-error");
    return;
  }

  const user = await api.getAuthenticatedUser();
  window.location.replace(user ? "app.html" : "login.html");
}
