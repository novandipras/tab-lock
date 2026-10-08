(async () => {
  let host;
  let dialog;
  let dialogMode;
  // Closed shadow roots hide the input target from page shortcuts; intercept keys before page handlers run.
  for (const type of ["keydown", "keypress", "keyup"]) {
    window.addEventListener(type, (event) => {
      if (!dialog?.open) return;
      event.stopImmediatePropagation();
      if (event.key === "Escape" && dialogMode === "unlock") event.preventDefault();
    }, { capture: true });
  }
  if (!document.documentElement) {
    await new Promise((resolve) => {
      const observer = new MutationObserver(() => {
        if (document.documentElement) {
          observer.disconnect();
          resolve();
        }
      });
      observer.observe(document, { childList: true });
    });
  }
  let currentKey;
  let unlockedKey;
  let version = 0;
  let busy = false;
  const pending = document.createElement("style");
  pending.textContent = "html { visibility: hidden !important; }";
  document.documentElement.append(pending);

  async function request(action, pin) {
    const result = await chrome.runtime.sendMessage({ action, pin, url: location.href });
    if (!result || result.error) throw new Error(result?.error || "The extension is not responding.");
    return result;
  }

  function close() {
    dialog?.close();
    host?.remove();
    host = null;
    dialog = null;
    dialogMode = null;
  }

  function show(mode) {
    close();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    host = document.createElement("div");
    host.style.cssText = "all: initial !important; visibility: visible !important;";
    const root = host.attachShadow({ mode: "closed" });
    root.innerHTML = `
      <style>
        :host { color-scheme: dark; }
        dialog {
          position: fixed; inset: 0; width: 100vw; height: 100dvh; max-width: none; max-height: none;
          margin: 0; padding: 24px; box-sizing: border-box; border: 0; color: #f4f5f7;
          background: transparent; font: 16px/1.5 system-ui, sans-serif;
        }
        dialog[open] { display: grid; place-items: center; }
        dialog::backdrop { background: rgba(6, 9, 16, .82); backdrop-filter: blur(18px); }
        form { width: min(100%, 340px); text-align: center; }
        svg { width: 64px; height: 64px; margin-bottom: 16px; }
        h1 { margin: 0 0 8px; font-size: 26px; font-weight: 650; }
        p { margin: 0 0 22px; color: #b7bfce; font-size: 14px; }
        label { display: block; text-align: left; margin-bottom: 6px; font-size: 13px; }
        input {
          display: block; width: 100%; box-sizing: border-box; padding: 13px 15px; margin-bottom: 14px;
          border: 1px solid #566073; border-radius: 12px; background: #171e2c; color: white;
          font: 20px system-ui; letter-spacing: 6px;
        }
        input:focus-visible, button:focus-visible { outline: 3px solid #a6c9ff; outline-offset: 3px; }
        button {
          width: 100%; border: 0; border-radius: 12px; padding: 13px; cursor: pointer;
          background: #edf3ff; color: #101724; font: 600 15px system-ui;
        }
        button:disabled { opacity: .6; cursor: wait; }
        .cancel { margin-top: 10px; background: transparent; color: #b7bfce; }
        .error { min-height: 24px; margin: 12px 0 0; color: #ffb4b4; }
        .note { font-size: 12px; margin: 18px 0 0; }
      </style>
      <dialog closedby="${mode === "setup" ? "closerequest" : "none"}" aria-labelledby="title" aria-describedby="description">
        <form>
          <svg viewBox="0 0 64 64" fill="none" aria-hidden="true">
            <rect x="13" y="27" width="38" height="29" rx="7" stroke="currentColor" stroke-width="3"/>
            <path d="M22 27V19a10 10 0 0 1 20 0v8" stroke="currentColor" stroke-width="3"/>
            <circle cx="32" cy="40" r="3" fill="currentColor"/>
            <path d="M32 43v5" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
          </svg>
          <h1 id="title">${mode === "setup" ? "Lock this tab" : "Tab locked"}</h1>
          <p id="description">${mode === "setup" ? "Create a PIN for this page." : "Enter your PIN to unlock this page."}</p>
          <label for="pin">PIN (4–12 digits)</label>
          <input id="pin" type="password" inputmode="numeric" pattern="[0-9]{4,12}" minlength="4" maxlength="12"
            autocomplete="off" required autofocus>
          ${mode === "setup" ? '<label for="confirm">Confirm PIN</label><input id="confirm" type="password"' +
            ' inputmode="numeric" pattern="[0-9]{4,12}" maxlength="12" autocomplete="off" required>' : ""}
          <button type="submit">${mode === "setup" ? "Lock tab" : "Unlock"}</button>
          ${mode === "unlock" ? '<button type="submit" class="cancel" data-action="remove">Remove lock</button>' : ""}
          ${mode === "setup" ? '<button type="button" class="cancel">Cancel</button>' : ""}
          <p class="error" role="status" aria-live="polite"></p>
          <p class="note">${mode === "setup" ? "Remember your PIN. PIN recovery is not available." :
            "Reloading locks this page again. Remove lock clears protection for this URL after you enter the correct PIN."}</p>
        </form>
      </dialog>`;
    document.documentElement.append(host);
    dialog = root.querySelector("dialog");
    dialogMode = mode;
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      if (mode === "setup" && !busy) close();
    });
    root.querySelector('button[type="button"]')?.addEventListener("click", () => { if (!busy) close(); });
    const form = root.querySelector("form");
    const pin = root.querySelector("#pin");
    const error = root.querySelector(".error");
    const submitButtons = root.querySelectorAll('button[type="submit"]');
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (busy) return;
      error.textContent = "";
      if (mode === "setup" && pin.value !== root.querySelector("#confirm").value) {
        error.textContent = "Both PINs must match.";
        return;
      }
      busy = true;
      submitButtons.forEach((button) => { button.disabled = true; });
      const submittedVersion = version;
      try {
        const action = mode === "setup" ? "setup" : event.submitter?.dataset.action || "unlock";
        const result = await request(action, pin.value);
        pin.value = "";
        if (submittedVersion !== version) return;
        currentKey = result.key;
        if (mode === "setup") {
          unlockedKey = null;
          show("unlock");
        } else {
          unlockedKey = result.key;
          close();
        }
      } catch (failure) {
        error.textContent = failure.message;
        pin.value = "";
        pin.focus();
      } finally {
        busy = false;
        submitButtons.forEach((button) => { button.disabled = false; });
      }
    });
    dialog.showModal();
    pin.focus();
  }

  async function refresh(forceLock = false) {
    const ticket = ++version;
    try {
      const status = await request("status");
      if (ticket !== version) return;
      const changedPage = currentKey !== status.key;
      if (changedPage || forceLock) unlockedKey = null;
      currentKey = status.key;
      if (status.locked && unlockedKey !== currentKey) {
        if (forceLock || changedPage || dialogMode !== "unlock") show("unlock");
      }
      else if (forceLock) show("setup");
      else if (changedPage || dialogMode !== "setup") close();
    } catch (error) {
      // ponytail: a DOM overlay deters casual viewing only; DevTools or disabling the extension can bypass it.
      console.error("Simple Tab Lock:", error);
      if (forceLock) {
        show("setup");
      }
    } finally {
      pending.remove();
    }
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "lock") {
      void refresh(true);
      return false;
    }
    if (message.action === "navigation") void refresh();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && currentKey && changes[currentKey]) {
      const change = changes[currentKey];
      if (!change.oldValue || change.newValue?.hash !== change.oldValue?.hash) void refresh();
    }
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) {
      unlockedKey = null;
      void refresh();
    }
  });
  void refresh();
})();
