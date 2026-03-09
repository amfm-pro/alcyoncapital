const statusMessage = document.getElementById("status-message");
const roleBadge = document.getElementById("role-badge");
const userEmail = document.getElementById("user-email");
const logoutBtn = document.getElementById("logout-btn");

const addForm = document.getElementById("add-form");
const itemInput = document.getElementById("item-input");
const searchInput = document.getElementById("search-input");
const itemList = document.getElementById("item-list");
const addButton = addForm.querySelector("button");

let currentUser = null;
let items = [];
let query = "";
let isAdmin = false;
let draggedItemId = null;
let editingItemId = null;

const MAX_ITEM_TEXT_LENGTH = 120;

initAppPage();

async function initAppPage() {
  const api = window.SupabaseApi;
  api?.onAuthStateChange?.((event) => {
    if (event === "PASSWORD_RECOVERY") {
      redirectToReset();
    }
  });

  if (redirectIfRecoveryContext()) return;

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

  isAdmin = await resolveIsAdmin(api);
  applyRoleUIState();

  userEmail.textContent = currentUser.email || "Connecte";
  showStatus("Connecte.", false);

  bindEvents();
  await loadItems();
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

function bindEvents() {
  logoutBtn.addEventListener("click", onLogout);
  addForm.addEventListener("submit", onAddItem);

  searchInput.addEventListener("input", (event) => {
    query = event.target.value.trim().toLowerCase();
    renderItems();
  });

  itemList.addEventListener("click", onItemListClick);
  itemList.addEventListener("dblclick", onItemListDblClick);
  itemList.addEventListener("keydown", onItemListKeyDown);
  itemList.addEventListener("change", onItemListChange);
  itemList.addEventListener("dragstart", onItemDragStart);
  itemList.addEventListener("dragover", onItemDragOver);
  itemList.addEventListener("drop", onItemDrop);
  itemList.addEventListener("dragend", onItemDragEnd);
}

function disableApp() {
  addButton.disabled = true;
  itemInput.disabled = true;
  searchInput.disabled = true;
  logoutBtn.disabled = true;
}

async function resolveIsAdmin(api) {
  // Equivalent to supabase.auth.getSession() in this app wrapper.
  const session = api.getSession();
  const sessionUserId = session?.user?.id || currentUser?.id;
  if (!sessionUserId) return false;

  const response = await api.restRequest(
    `/profiles?select=role&user_id=eq.${encodeURIComponent(sessionUserId)}&limit=1`,
    { method: "GET" },
    true
  );

  if (response.error) return false;

  const profile = Array.isArray(response.data) ? response.data[0] : null;
  return profile?.role === "admin";
}

function applyRoleUIState() {
  const readOnly = !isAdmin;
  itemInput.disabled = readOnly;
  addButton.disabled = readOnly;
  roleBadge.hidden = !readOnly;

  document.querySelectorAll(".admin-only").forEach((element) => {
    element.hidden = readOnly;
  });
}

async function onLogout() {
  await window.SupabaseApi.signOut();
  window.location.replace("login.html");
}

async function loadItems() {
  const response = await window.SupabaseApi.restRequest(
    "/items?select=id,text,done,position,created_at&order=position.asc.nullslast&order=created_at.asc",
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
  if (!isAdmin) return;

  const text = itemInput.value.trim();
  if (!text || !currentUser) return;

  const nextPosition = computeNextTopPosition();
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
        position: nextPosition,
        user_id: currentUser.id,
      }),
    },
    true
  );

  if (response.error) {
    showAdminError(`Ajout impossible: ${response.error}`);
    return;
  }

  await loadItems();
  itemInput.value = "";
  itemInput.focus();
}

async function onItemListClick(event) {
  if (!isAdmin) return;

  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;
  if (target.matches(".edit-btn")) {
    const id = target.dataset.id;
    if (!id) return;
    startEditItem(id);
    return;
  }

  if (target.matches(".save-btn")) {
    const id = target.dataset.id;
    if (!id) return;
    await saveEditedItem(id);
    return;
  }

  if (target.matches(".cancel-btn")) {
    cancelEditItem();
    return;
  }

  if (!target.matches(".delete-btn")) return;

  const id = target.dataset.id;
  if (!id || !currentUser) return;

  const response = await window.SupabaseApi.restRequest(
    `/items?id=eq.${encodeURIComponent(id)}`,
    { method: "DELETE" },
    true
  );

  if (response.error) {
    showAdminError(`Suppression impossible: ${response.error}`);
    return;
  }

  await loadItems();
}

function onItemListDblClick(event) {
  if (!isAdmin) return;

  const target = event.target;
  if (!(target instanceof Element)) return;
  if (!target.matches(".item-text")) return;

  const itemElement = target.closest(".item[data-id]");
  const id = itemElement?.getAttribute("data-id");
  if (!id) return;

  startEditItem(id);
}

async function onItemListKeyDown(event) {
  if (!isAdmin) return;

  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  if (!target.matches(".edit-input")) return;

  const id = target.dataset.id;
  if (!id) return;

  if (event.key === "Enter") {
    event.preventDefault();
    await saveEditedItem(id);
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    cancelEditItem();
  }
}

async function onItemListChange(event) {
  if (!isAdmin) return;

  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  if (!target.matches(".item-checkbox")) return;

  const id = target.dataset.id;
  if (!id || !currentUser) return;

  const item = items.find((entry) => entry.id === id);
  if (!item) return;

  const nextDone = target.checked;
  target.checked = item.done;

  const response = await window.SupabaseApi.restRequest(
    `/items?id=eq.${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ done: nextDone }),
    },
    true
  );

  if (response.error) {
    showAdminError(`Mise a jour impossible: ${response.error}`);
    return;
  }

  await loadItems();
}

function onItemDragStart(event) {
  if (!isAdmin) return;
  if (editingItemId) return;
  if (query) return;

  const target = event.target;
  if (!(target instanceof Element)) return;

  const itemElement = target.closest(".item[data-id]");
  if (!(itemElement instanceof HTMLLIElement)) return;

  draggedItemId = itemElement.dataset.id || null;
  if (!draggedItemId) return;

  itemElement.classList.add("item-dragging");
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", draggedItemId);
  }
}

function onItemDragOver(event) {
  if (!isAdmin) return;
  if (editingItemId) return;
  if (query) return;

  const target = event.target;
  if (!(target instanceof Element)) return;
  if (!draggedItemId) return;

  const overElement = target.closest(".item[data-id]");
  if (!(overElement instanceof HTMLLIElement)) return;
  if (overElement.dataset.id === draggedItemId) return;

  const draggedElement = itemList.querySelector(`.item[data-id="${draggedItemId}"]`);
  if (!(draggedElement instanceof HTMLLIElement)) return;

  event.preventDefault();

  const bounds = overElement.getBoundingClientRect();
  const shouldInsertAfter = event.clientY > bounds.top + bounds.height / 2;
  const nextSibling = shouldInsertAfter ? overElement.nextElementSibling : overElement;

  if (nextSibling !== draggedElement) {
    itemList.insertBefore(draggedElement, nextSibling);
  }
}

async function onItemDrop(event) {
  if (!isAdmin) return;
  if (editingItemId) return;
  if (query) return;

  event.preventDefault();
  if (!draggedItemId) return;

  const nextOrderIds = Array.from(itemList.querySelectorAll(".item[data-id]"))
    .map((node) => node.dataset.id)
    .filter((id) => Boolean(id));

  if (nextOrderIds.length <= 1) {
    clearDragState();
    return;
  }

  const previousOrder = items.map((item) => item.id);
  const changed =
    nextOrderIds.length === previousOrder.length &&
    nextOrderIds.some((id, index) => id !== previousOrder[index]);

  clearDragState();

  if (!changed) return;
  await persistReorder(nextOrderIds);
}

function onItemDragEnd() {
  if (!isAdmin) return;
  clearDragState();
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
      (item) => {
        const canDrag = isAdmin && !query && !editingItemId;
        const isEditing = isAdmin && editingItemId === item.id;
        return `
      <li class="item ${item.done ? "item-done" : ""} ${
        canDrag ? "item-draggable" : ""
      }" data-id="${item.id}" ${canDrag ? 'draggable="true"' : ""}>
        ${canDrag ? '<span class="drag-handle" aria-hidden="true">☰</span>' : ""}
        ${
          isEditing
            ? `<div class="item-main">
                <input
                  class="edit-input"
                  type="text"
                  data-id="${item.id}"
                  value="${escapeHtml(item.text)}"
                  maxlength="${MAX_ITEM_TEXT_LENGTH}"
                  aria-label="Modifier ${escapeHtml(item.text)}"
                />
              </div>`
            : `<label class="item-main" for="item-${item.id}">
          <input
            id="item-${item.id}"
            class="item-checkbox"
            type="checkbox"
            data-id="${item.id}"
            ${item.done ? "checked" : ""}
            ${!isAdmin ? "disabled" : ""}
            aria-label="Marquer ${escapeHtml(item.text)}"
          />
          <span class="item-text">${escapeHtml(item.text)}</span>
        </label>`
        }
        <div class="item-actions">
          ${
            isEditing
              ? `<button class="save-btn" data-id="${item.id}" aria-label="Enregistrer ${escapeHtml(
                  item.text
                )}">✓</button>
                 <button class="cancel-btn" data-id="${item.id}" aria-label="Annuler edition">✕</button>`
              : isAdmin
              ? `<button class="edit-btn" data-id="${item.id}" aria-label="Modifier ${escapeHtml(
                  item.text
                )}">✎</button>
                 <button class="delete-btn" data-id="${item.id}" aria-label="Supprimer ${escapeHtml(
                  item.text
                )}">X</button>`
              : ""
          }
        </div>
      </li>
    `;
      }
    )
    .join("");

  if (isAdmin && editingItemId) {
    const editInput = itemList.querySelector(`.edit-input[data-id="${editingItemId}"]`);
    if (editInput instanceof HTMLInputElement) {
      editInput.focus();
      editInput.setSelectionRange(editInput.value.length, editInput.value.length);
    }
  }
}

function showAdminError(message) {
  if (!isAdmin) return;
  showStatus(message, true);
}

function clearDragState() {
  draggedItemId = null;
  itemList.querySelectorAll(".item-dragging").forEach((element) => {
    element.classList.remove("item-dragging");
  });
}

async function persistReorder(visibleOrderIds) {
  if (!isAdmin) return;

  const visibleSet = new Set(visibleOrderIds);
  const fullOrderIds = [
    ...visibleOrderIds,
    ...items.map((item) => item.id).filter((id) => !visibleSet.has(id)),
  ];

  const updates = fullOrderIds.map((id, index) => ({
    id,
    position: (index + 1) * 10,
  }));

  for (const update of updates) {
    const response = await window.SupabaseApi.restRequest(
      `/items?id=eq.${encodeURIComponent(update.id)}`,
      {
        method: "PATCH",
        body: JSON.stringify({ position: update.position }),
      },
      true
    );

    if (response.error) {
      showAdminError(`Reorganisation impossible: ${response.error}`);
      await loadItems();
      return;
    }
  }

  await loadItems();
}

function startEditItem(itemId) {
  if (!isAdmin) return;
  if (!itemId) return;
  editingItemId = itemId;
  clearDragState();
  renderItems();
}

function cancelEditItem() {
  if (!isAdmin) return;
  editingItemId = null;
  renderItems();
}

async function saveEditedItem(itemId) {
  if (!isAdmin) return;
  if (!itemId) return;

  const item = items.find((entry) => entry.id === itemId);
  if (!item) return;

  const input = itemList.querySelector(`.edit-input[data-id="${itemId}"]`);
  if (!(input instanceof HTMLInputElement)) return;

  const newText = input.value.trim();
  if (!newText) {
    showAdminError("Le texte ne peut pas etre vide.");
    input.focus();
    return;
  }

  if (newText.length > MAX_ITEM_TEXT_LENGTH) {
    showAdminError(`Texte trop long (${MAX_ITEM_TEXT_LENGTH} caracteres max).`);
    input.focus();
    return;
  }

  if (newText === item.text) {
    editingItemId = null;
    renderItems();
    return;
  }

  const response = await window.SupabaseApi.restRequest(
    `/items?id=eq.${encodeURIComponent(itemId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ text: newText }),
    },
    true
  );

  if (response.error) {
    showAdminError(`Edition impossible: ${response.error}`);
    return;
  }

  editingItemId = null;
  await loadItems();
}

function computeNextTopPosition() {
  const numericPositions = items
    .map((item) => Number(item.position))
    .filter((value) => Number.isFinite(value));

  if (numericPositions.length === 0) {
    return Date.now();
  }

  return Math.min(...numericPositions) - 1;
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
