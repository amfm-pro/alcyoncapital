const statusMessage = document.getElementById("status-message");
const resetForm = document.getElementById("reset-form");
const backLink = document.getElementById("reset-back-link");
const passwordInput = document.getElementById("new-password");
const confirmInput = document.getElementById("confirm-password");

const MIN_PASSWORD_LENGTH = 12;

initResetPage();

async function initResetPage() {
  const api = window.SupabaseApi;

  if (!api?.isConfigReady || !api.isConfigReady()) {
    showStatus(api?.getConfigError?.() || "Configuration invalide.", true);
    showBackToLogin();
    return;
  }

  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  const hashParams = new URLSearchParams(
    window.location.hash.startsWith("#") ? window.location.hash.slice(1) : ""
  );
  const searchParams = new URLSearchParams(window.location.search.slice(1));
  const recoveryType = hashParams.get("type") || searchParams.get("type");
  const accessTokenFromUrl = hashParams.get("access_token") || searchParams.get("access_token");
  const isRecoveryLink = Boolean(code) || (recoveryType === "recovery" && Boolean(accessTokenFromUrl));

  if (!isRecoveryLink) {
    showInvalidRecoveryLink();
    return;
  }

  if (code) {
    const exchangeResult = await api.exchangeCodeForSession(code);
    if (exchangeResult.error) {
      showInvalidRecoveryLink();
      return;
    }

    // Clean query params after successful PKCE exchange.
    if (window.history?.replaceState) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }

  const user = await api.getAuthenticatedUser();
  if (!user) {
    showInvalidRecoveryLink();
    return;
  }

  resetForm.hidden = false;
  resetForm.addEventListener("submit", onResetSubmit);
  showStatus("Saisissez votre nouveau mot de passe.", false);
}

async function onResetSubmit(event) {
  event.preventDefault();
  const submitButton = resetForm.querySelector("button");

  const newPassword = passwordInput.value;
  const confirmPassword = confirmInput.value;

  if (!newPassword || newPassword.trim().length < MIN_PASSWORD_LENGTH) {
    showStatus(`Mot de passe trop court (${MIN_PASSWORD_LENGTH} caracteres min).`, true);
    return;
  }

  if (newPassword !== confirmPassword) {
    showStatus("La confirmation ne correspond pas.", true);
    return;
  }

  submitButton.disabled = true;
  const result = await window.SupabaseApi.updateUser({ password: newPassword });
  if (result.error) {
    showStatus(`Mise a jour impossible: ${result.error}`, true);
    submitButton.disabled = false;
    return;
  }

  showStatus("Mot de passe mis a jour. Redirection...", false);
  await window.SupabaseApi.signOut();

  setTimeout(() => {
    window.location.replace("login.html");
  }, 2000);
}

function showInvalidRecoveryLink() {
  showStatus("Lien invalide ou expire.", true);
  showBackToLogin();
  resetForm.hidden = true;
}

function showBackToLogin() {
  backLink.hidden = false;
}

function showStatus(message, isError) {
  statusMessage.textContent = message;
  statusMessage.classList.toggle("status-error", isError);
}
