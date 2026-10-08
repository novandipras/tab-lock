const PIN_PATTERN = /^\d{4,12}$/;
let queue = Promise.resolve();
const AUTH_HOST = "org.simpletablock.auth";

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

async function nativeAuth(action, count) {
  try {
    const result = await chrome.runtime.sendNativeMessage(AUTH_HOST, { action, count });
    if (result.error) throw new Error(result.error);
    return result;
  } catch (error) {
    throw new Error("Device authentication is unavailable. Locks were not removed. " + error.message);
  }
}

async function manage(message) {
  if (message.action === "manage-auth") return nativeAuth("status");
  const records = await chrome.storage.local.get(null);
  if (message.action === "manage-list") {
    const tabs = await chrome.tabs.query({});
    const openPages = new Map();
    for (const tab of tabs) {
      if (/^https?:/.test(tab.url || "")) openPages.set(await pageKey(tab.url), tab);
    }
    return { pages: Object.entries(records).filter(([key]) => key.startsWith("page:")).map(([key, record]) => ({
      key, url: record.url || openPages.get(key)?.url || "", title: record.title || openPages.get(key)?.title || "Older page",
    })) };
  }
  if (message.action !== "manage-remove") throw new Error("Invalid request.");
  if (!Array.isArray(message.keys) || !message.keys.length || message.keys.length > 1000) throw new Error("Select a page first.");
  const keys = [...new Set(message.keys)];
  if (keys.some((key) => typeof key !== "string" || !/^page:[a-f0-9]{64}$/.test(key) || !records[key])) {
    throw new Error("The list has changed. Refresh the manager page.");
  }
  const status = await nativeAuth("status");
  if (status.passwordRequired === true) {
    const auth = await nativeAuth("authenticate", keys.length);
    if (auth.authenticated !== true) throw new Error("Authentication was canceled or failed. Locks were not removed.");
  } else if (status.passwordRequired === false) {
    if (message.confirmed !== true) return { confirmationRequired: true };
    const auth = await nativeAuth("confirm-no-password");
    if (auth.noPassword !== true) throw new Error("The device security status has changed. Please try again.");
  } else throw new Error("The device password status could not be verified. Locks were not removed.");
  await chrome.storage.local.remove(keys);
  return { removed: keys.length };
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "lock-tab",
    title: "Lock this tab",
    contexts: ["all"],
    documentUrlPatterns: ["http://*/*", "https://*/*"],
  });
  if (chrome.contextMenus.ContextType?.TAB) {
    chrome.contextMenus.create({ id: "lock-tab-header", title: "Lock tab", contexts: ["tab"] });
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!["lock-tab", "lock-tab-header"].includes(info.menuItemId) || !tab?.id || !/^https?:/.test(tab.url || "")) return;
  try {
    if (info.menuItemId === "lock-tab-header") await chrome.tabs.update(tab.id, { active: true });
    try {
      await chrome.tabs.sendMessage(tab.id, { action: "lock" }, { frameId: 0 });
    } catch {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
      await chrome.tabs.sendMessage(tab.id, { action: "lock" }, { frameId: 0 });
    }
  } catch (error) {
    console.error("Simple Tab Lock: the page could not be locked.", error);
  }
});

// ponytail: protection follows the URL, not a browser tab ID; fragments share the same PIN.
async function pageKey(rawUrl) {
  const url = new URL(rawUrl);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("This page is not supported.");
  url.hash = "";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(url.href));
  return "page:" + toHex(digest);
}

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function pinHash(pin, salt) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({
    name: "PBKDF2",
    hash: "SHA-256",
    salt: Uint8Array.from(salt),
    iterations: 210000,
  }, material, 256);
  return toHex(bits);
}

async function handle(message, sender) {
  if (sender.id === chrome.runtime.id && sender.url === chrome.runtime.getURL("manager.html")) return manage(message);
  if (sender.id !== chrome.runtime.id || !sender.tab || sender.frameId !== 0) throw new Error("Invalid request.");
  const tab = await chrome.tabs.get(sender.tab.id);
  const key = await pageKey(tab.url);
  if (message.url && key !== await pageKey(message.url)) throw new Error("The page has changed. Please try again.");
  const record = (await chrome.storage.local.get(key))[key];
  if (message.action === "status") {
    if (record && !record.url) {
      const url = new URL(tab.url);
      url.hash = "";
      await chrome.storage.local.set({ [key]: { ...record, url: url.href, title: tab.title || url.hostname } });
    }
    return { locked: Boolean(record), key };
  }
  if (!["setup", "unlock", "remove"].includes(message.action)) throw new Error("Invalid request.");
  if (!PIN_PATTERN.test(message.pin)) throw new Error("Use a PIN of 4–12 digits.");
  if (message.action === "setup") {
    if (record) throw new Error("This page already has a PIN. Use the existing PIN.");
    const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)));
    const hash = await pinHash(message.pin, salt);
    const url = new URL(tab.url);
    url.hash = "";
    await chrome.storage.local.set({ [key]: { salt, hash, failures: 0, retryAt: 0, url: url.href, title: tab.title || url.hostname } });
    return { locked: true, key };
  }
  if (!record) throw new Error("No PIN was found for this page.");
  const now = Date.now();
  if (record.retryAt > now) {
    throw new Error(`Wait ${Math.ceil((record.retryAt - now) / 1000)} seconds before trying again.`);
  }
  if (await pinHash(message.pin, record.salt) !== record.hash) {
    record.failures = (record.failures || 0) + 1;
    if (record.failures >= 5) {
      record.retryAt = now + 30000;
      record.failures = 0;
    }
    await chrome.storage.local.set({ [key]: record });
    throw new Error(record.retryAt > now ? "Incorrect PIN. Wait 30 seconds before trying again." : "Incorrect PIN.");
  }
  if (message.action === "remove") await chrome.storage.local.remove(key);
  else await chrome.storage.local.set({ [key]: { ...record, failures: 0, retryAt: 0 } });
  return { unlocked: true, key };
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  const task = queue.then(() => handle(message, sender));
  queue = task.catch(() => {});
  task.then(respond, (error) => respond({ error: error.message }));
  return true;
});

function notifyNavigation(details) {
  if (details.frameId !== 0) return;
  chrome.tabs.sendMessage(details.tabId, { action: "navigation" }, { frameId: 0 }).catch(() => {});
}

chrome.webNavigation.onHistoryStateUpdated.addListener(notifyNavigation);
chrome.webNavigation.onReferenceFragmentUpdated.addListener(notifyNavigation);
