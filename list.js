const statusMessage = document.getElementById("status-message");
const userEmail = document.getElementById("user-email");
const logoutBtn = document.getElementById("logout-btn");

const addForm = document.getElementById("add-form");
const itemInput = document.getElementById("item-input");
const searchInput = document.getElementById("search-input");
const itemList = document.getElementById("item-list");

let currentUser = null;
let items = [];
let query = "";

initAppPage();

async function initAppPage() {
  const api = window.SupabaseApi;

  if (!api?.isConfigReady || !api.isConfigReady()) {
    showStatus(api?.getConfigError?.() || "Configuration invalide.", true);
    disableApp();
    return;
  }

  currentUser = await api.getAuthenticatedUser();
  if (!currentUser) {
    window.location.replace("login.html");
    return;
  }

  userEmail.textContent = currentUser.email || "Connecte";
  showStatus("Connecte.", false);

  bindEvents();
  await loadItems();
}

function bindEvents() {
  logoutBtn.addEventListener("click", onLogout);
  addForm.addEventListener("submit", onAddItem);

  searchInput.addEventListener("input", (event) => {
    query = event.target.value.trim().toLowerCase();
    renderItems();
  });

  itemList.addEventListener("click", onItemListClick);
  itemList.addEventListener("change", onItemListChange);
}

function disableApp() {
  addForm.querySelector("button").disabled = true;
  itemInput.disabled = true;
  searchInput.disabled = true;
  logoutBtn.disabled = true;
}

async function onLogout() {
  await window.SupabaseApi.signOut();
  window.location.replace("login.html");
}

async function loadItems() {
  const response = await window.SupabaseApi.restRequest(
    "/items?select=id,text,done,created_at&order=created_at.desc",
    { method: "GET" },
    true
  );

  if (response.error) {
    showStatus(`Chargement impossible: ${response.error}`, true);
    items = [];
    renderItems();
    return;
  }

  items = response.data ?? [];
  renderItems();
}

async function onAddItem(event) {
  event.preventDefault();

  const text = itemInput.value.trim();
  if (!text || !currentUser) return;

  const response = await window.SupabaseApi.restRequest(
    "/items",
    {
      method: "POST",
      headers: {
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        text,
        done: false,
        user_id: currentUser.id,
      }),
    },
    true
  );

  if (response.error) {
    showStatus(`Ajout impossible: ${response.error}`, true);
    return;
  }

  const inserted = Array.isArray(response.data) ? response.data[0] : response.data;
  if (inserted) {
    items.unshift(inserted);
  }

  itemInput.value = "";
  itemInput.focus();
  renderItems();
}

async function onItemListClick(event) {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;

  if (!target.matches(".delete-btn")) return;

  const id = target.dataset.id;
  if (!id || !currentUser) return;

  const response = await window.SupabaseApi.restRequest(
    `/items?id=eq.${encodeURIComponent(id)}`,
    { method: "DELETE" },
    true
  );

  if (response.error) {
    showStatus(`Suppression impossible: ${response.error}`, true);
    return;
  }

  items = items.filter((item) => item.id !== id);
  renderItems();
}

async function onItemListChange(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  if (!target.matches(".item-checkbox")) return;

  const id = target.dataset.id;
  if (!id || !currentUser) return;

  const item = items.find((entry) => entry.id === id);
  if (!item) return;

  const nextDone = target.checked;
  const response = await window.SupabaseApi.restRequest(
    `/items?id=eq.${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ done: nextDone }),
    },
    true
  );

  if (response.error) {
    target.checked = item.done;
    showStatus(`Mise a jour impossible: ${response.error}`, true);
    return;
  }

  items = items.map((entry) =>
    entry.id === id ? { ...entry, done: nextDone } : entry
  );
  renderItems();
}

function getFilteredItems() {
  if (!query) return items;
  return items.filter((item) => item.text.toLowerCase().includes(query));
}

function renderItems() {
  const filtered = getFilteredItems();

  if (filtered.length === 0) {
    const message = items.length === 0 ? "Aucun element pour le moment." : "Aucun resultat.";
    itemList.innerHTML = `<li class="empty">${message}</li>`;
    return;
  }

  itemList.innerHTML = filtered
    .map(
      (item) => `
      <li class="item ${item.done ? "item-done" : ""}">
        <label class="item-main" for="item-${item.id}">
          <input
            id="item-${item.id}"
            class="item-checkbox"
            type="checkbox"
            data-id="${item.id}"
            ${item.done ? "checked" : ""}
            aria-label="Marquer ${escapeHtml(item.text)}"
          />
          <span class="item-text">${escapeHtml(item.text)}</span>
        </label>
        <div class="item-actions">
          <button class="delete-btn" data-id="${item.id}" aria-label="Supprimer ${escapeHtml(
        item.text
      )}">X</button>
        </div>
      </li>
    `
    )
    .join("");
}

function showStatus(message, isError) {
  statusMessage.textContent = message;
  statusMessage.classList.toggle("status-error", isError);
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
