const pages = document.querySelector("#pages");
const all = document.querySelector("#all");
const remove = document.querySelector("#remove");
const status = document.querySelector("#status");
const confirmation = document.querySelector("#confirm");
let ready = false;
let busy = false;
let refreshPending = false;
let statusTimer;

function showStatus(message, temporary = true) {
  clearTimeout(statusTimer);
  status.textContent = message;
  if (temporary && message) statusTimer = setTimeout(() => { status.textContent = ""; }, 5000);
}

async function request(action, extra = {}) {
  const result = await chrome.runtime.sendMessage({ action, ...extra });
  if (!result || result.error) throw new Error(result?.error || "The extension is not responding.");
  return result;
}

function selection() {
  return Array.from(pages.querySelectorAll("input:checked"), (input) => input.value);
}

function updateSelection() {
  const total = pages.querySelectorAll("input").length;
  const count = selection().length;
  document.querySelector("#selection").textContent = `${count} selected`;
  all.checked = total > 0 && count === total;
  all.indeterminate = count > 0 && count < total;
  all.disabled = busy || !total;
  remove.disabled = busy || !ready || !count;
}

async function load() {
  refreshPending = false;
  busy = true;
  const selected = new Set(selection());
  updateSelection();
  try {
    const result = await request("manage-list");
    pages.replaceChildren();
    for (const page of result.pages) {
      const item = document.createElement("li");
      const label = document.createElement("label");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = page.key;
      checkbox.checked = selected.has(page.key);
      const description = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = page.title;
      const url = document.createElement("small");
      url.textContent = page.url || `URL not available yet · ${page.key.slice(5, 17)}`;
      description.append(title, url);
      label.append(checkbox, description);
      item.append(label);
      pages.append(item);
    }
    document.querySelector("#empty").hidden = result.pages.length > 0;
  } catch (error) {
    showStatus(error.message);
  } finally {
    busy = false;
    updateSelection();
    if (refreshPending) void load();
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  const changed = Object.entries(changes).some(([key, { oldValue, newValue }]) => key.startsWith("page:") &&
    (!oldValue || !newValue || oldValue.url !== newValue.url || oldValue.title !== newValue.title));
  if (area !== "local" || !changed) return;
  refreshPending = true;
  if (!busy) void load();
});

pages.addEventListener("change", updateSelection);
all.addEventListener("change", () => {
  pages.querySelectorAll("input").forEach((input) => { input.checked = all.checked; });
  updateSelection();
});
document.querySelector("#refresh").addEventListener("click", () => {
  showStatus("");
  void load();
});
remove.addEventListener("click", async () => {
  if (busy) return;
  const keys = selection();
  busy = true;
  pages.querySelectorAll("input").forEach((input) => { input.disabled = true; });
  document.querySelector("#refresh").disabled = true;
  updateSelection();
  showStatus("Waiting for device verification…", false);
  try {
    let result = await request("manage-remove", { keys });
    if (result.confirmationRequired) {
      document.querySelector("#confirm-description").textContent =
        `This device has no password. Remove locks from ${keys.length} selected ${keys.length === 1 ? "page" : "pages"}?`;
      const confirmed = new Promise((resolve) => {
        confirmation.addEventListener("close", () => resolve(confirmation.returnValue === "remove"), { once: true });
      });
      confirmation.returnValue = "cancel";
      confirmation.showModal();
      if (!await confirmed) { showStatus("Removal canceled."); return; }
      result = await request("manage-remove", { keys, confirmed: true });
    }
    const removedKeys = new Set(keys);
    for (const input of pages.querySelectorAll("input")) {
      if (removedKeys.has(input.value)) input.closest("li").remove();
    }
    document.querySelector("#empty").hidden = pages.children.length > 0;
    updateSelection();
    await load();
    showStatus(`${result.removed} ${result.removed === 1 ? "lock" : "locks"} removed.`);
  } catch (error) {
    showStatus(error.message);
  } finally {
    busy = false;
    pages.querySelectorAll("input").forEach((input) => { input.disabled = false; });
    document.querySelector("#refresh").disabled = false;
    updateSelection();
    if (refreshPending) void load();
  }
});

void load();
request("manage-auth").then((result) => {
  ready = typeof result.passwordRequired === "boolean";
  updateSelection();
}).catch((error) => { showStatus(error.message); });
