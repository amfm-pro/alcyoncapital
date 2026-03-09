initRouterPage();

async function initRouterPage() {
  const api = window.SupabaseApi;
  api?.onAuthStateChange?.((event) => {
    if (event === "PASSWORD_RECOVERY") {
      redirectToReset();
    }
  });

  if (redirectIfRecoveryContext()) return;

  const statusMessage = document.getElementById("route-status");

  if (!api?.isConfigReady || !api.isConfigReady()) {
    statusMessage.textContent = api?.getConfigError?.() || "Configuration invalide.";
    statusMessage.classList.add("status-error");
    return;
  }

  const user = await api.getAuthenticatedUser();
  window.location.replace(user ? "app.html" : "login.html");
}

function redirectIfRecoveryContext() {
  const search = window.location.search.startsWith("?")
    ? window.location.search.slice(1)
    : window.location.search;
  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  const searchParams = new URLSearchParams(search);
  const hashParams = new URLSearchParams(hash);

  const searchType = searchParams.get("type");
  const hashType = hashParams.get("type");
  const hasRecoveryType = searchType === "recovery" || hashType === "recovery";
  const hasHashRecoveryToken =
    hashType === "recovery" && Boolean(hashParams.get("access_token"));

  if (!hasRecoveryType && !hasHashRecoveryToken) return false;

  redirectToReset();
  return true;
}

function redirectToReset() {
  window.location.replace(`reset.html${window.location.search}${window.location.hash}`);
}
