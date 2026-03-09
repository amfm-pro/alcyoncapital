(() => {
  const SESSION_KEY = "mini-list-session";

  const appConfig = window.APP_CONFIG ?? {};
  const supabaseUrl = appConfig.SUPABASE_URL;
  const supabaseAnonKey = appConfig.SUPABASE_ANON_KEY;

  let authSession = loadSession();
  const authStateListeners = new Set();

  function isConfigReady() {
    return Boolean(supabaseUrl && supabaseAnonKey);
  }

  function getConfigError() {
    return "Configuration manquante: creez config.js a partir de config.example.js.";
  }

  function getSession() {
    return authSession;
  }

  function consumeAuthRedirect() {
    const hash = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : "";
    const search = window.location.search.startsWith("?")
      ? window.location.search.slice(1)
      : "";
    const hashParams = new URLSearchParams(hash);
    const searchParams = new URLSearchParams(search);

    const accessToken =
      hashParams.get("access_token") || searchParams.get("access_token");
    const refreshToken =
      hashParams.get("refresh_token") || searchParams.get("refresh_token");
    const redirectType = hashParams.get("type") || searchParams.get("type");

    if (!accessToken) return false;

    authSession = {
      access_token: accessToken,
      refresh_token: refreshToken || authSession?.refresh_token || null,
      user: authSession?.user ?? null,
    };
    saveSession(authSession);
    notifyAuthStateChange(
      redirectType === "recovery" ? "PASSWORD_RECOVERY" : "SIGNED_IN"
    );

    if (window.history?.replaceState) {
      window.history.replaceState(
        {},
        document.title,
        window.location.pathname + window.location.search
      );
    } else {
      window.location.hash = "";
    }

    return true;
  }

  async function loginWithPassword(email, password) {
    const response = await authRequest("/token?grant_type=password", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });

    if (response.error) return response;

    authSession = {
      access_token: response.data.access_token,
      refresh_token: response.data.refresh_token,
      user: response.data.user ?? null,
    };

    saveSession(authSession);
    notifyAuthStateChange("SIGNED_IN");
    return { data: authSession.user };
  }

  async function exchangeCodeForSession(code) {
    const response = await authRequest("/token?grant_type=pkce", {
      method: "POST",
      body: JSON.stringify({ auth_code: code }),
    });

    if (response.error) return response;

    authSession = {
      access_token: response.data.access_token,
      refresh_token: response.data.refresh_token,
      user: response.data.user ?? null,
    };
    saveSession(authSession);
    notifyAuthStateChange("PASSWORD_RECOVERY");

    return { data: authSession };
  }

  async function refreshSession() {
    if (!authSession?.refresh_token) return false;

    const response = await authRequest("/token?grant_type=refresh_token", {
      method: "POST",
      body: JSON.stringify({ refresh_token: authSession.refresh_token }),
    });

    if (response.error) return false;

    authSession = {
      access_token: response.data.access_token,
      refresh_token: response.data.refresh_token,
      user: response.data.user ?? authSession.user,
    };
    saveSession(authSession);
    return true;
  }

  async function fetchCurrentUser() {
    if (!authSession?.access_token) return null;

    const response = await authRequest("/user", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${authSession.access_token}`,
      },
    });

    if (!response.error && response.data) {
      authSession.user = response.data;
      saveSession(authSession);
      return response.data;
    }

    const refreshed = await refreshSession();
    if (!refreshed || !authSession?.access_token) return null;

    const retry = await authRequest("/user", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${authSession.access_token}`,
      },
    });

    if (retry.error || !retry.data) return null;

    authSession.user = retry.data;
    saveSession(authSession);
    return retry.data;
  }

  async function getAuthenticatedUser() {
    consumeAuthRedirect();

    if (!authSession?.access_token && authSession?.refresh_token) {
      const refreshed = await refreshSession();
      if (!refreshed) {
        clearSession();
        return null;
      }
    }

    if (!authSession?.access_token) return null;

    const user = await fetchCurrentUser();
    if (!user) {
      clearSession();
      return null;
    }

    return user;
  }

  async function signOut() {
    if (authSession?.access_token) {
      await authRequest("/logout", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authSession.access_token}`,
        },
      });
    }

    clearSession();
    notifyAuthStateChange("SIGNED_OUT");
  }

  function onAuthStateChange(callback) {
    if (typeof callback !== "function") {
      return {
        data: {
          subscription: {
            unsubscribe: () => {},
          },
        },
      };
    }

    authStateListeners.add(callback);
    return {
      data: {
        subscription: {
          unsubscribe: () => {
            authStateListeners.delete(callback);
          },
        },
      },
    };
  }

  async function updateUser(attributes) {
    if (!authSession?.access_token) {
      const refreshed = await refreshSession();
      if (!refreshed) return { error: "Session invalide ou expiree." };
    }

    let response = await authRequest("/user", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${authSession.access_token}`,
      },
      body: JSON.stringify(attributes),
    });

    if (response.error && authSession?.refresh_token) {
      const refreshed = await refreshSession();
      if (refreshed) {
        response = await authRequest("/user", {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${authSession.access_token}`,
          },
          body: JSON.stringify(attributes),
        });
      }
    }

    if (response.error) return response;

    if (response.data) {
      authSession = {
        ...authSession,
        user: response.data,
      };
      saveSession(authSession);
    }

    return { data: response.data ?? null };
  }

  async function restRequest(path, options = {}, withAuth = false, retried = false) {
    const headers = {
      apikey: supabaseAnonKey,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    };

    if (withAuth && authSession?.access_token) {
      headers.Authorization = `Bearer ${authSession.access_token}`;
    }

    const response = await fetch(`${supabaseUrl}/rest/v1${path}`, {
      method: options.method || "GET",
      headers,
      body: options.body,
    });

    if (response.status === 401 && withAuth && !retried) {
      const refreshed = await refreshSession();
      if (refreshed) {
        return restRequest(path, options, withAuth, true);
      }
    }

    if (!response.ok) {
      return { error: await readError(response) };
    }

    if (response.status === 204) {
      return { data: null };
    }

    return { data: await response.json() };
  }

  async function authRequest(path, options = {}) {
    const headers = {
      apikey: supabaseAnonKey,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    };

    const response = await fetch(`${supabaseUrl}/auth/v1${path}`, {
      method: options.method || "GET",
      headers,
      body: options.body,
    });

    if (!response.ok) {
      return { error: await readError(response) };
    }

    if (response.status === 204) {
      return { data: null };
    }

    return { data: await response.json() };
  }

  function loadSession() {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw);
      if (!parsed?.access_token && !parsed?.refresh_token) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function saveSession(session) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }

  function clearSession() {
    authSession = null;
    localStorage.removeItem(SESSION_KEY);
  }

  function notifyAuthStateChange(event) {
    authStateListeners.forEach((listener) => {
      try {
        listener(event, authSession);
      } catch {
        // Ignore listener errors to keep auth flow stable.
      }
    });
  }

  async function readError(response) {
    try {
      const data = await response.json();
      return (
        data.msg ||
        data.error_description ||
        data.error ||
        `Erreur HTTP ${response.status}`
      );
    } catch {
      return `Erreur HTTP ${response.status}`;
    }
  }

  window.SupabaseApi = {
    isConfigReady,
    getConfigError,
    getSession,
    loginWithPassword,
    exchangeCodeForSession,
    onAuthStateChange,
    getAuthenticatedUser,
    signOut,
    updateUser,
    restRequest,
  };
})();
