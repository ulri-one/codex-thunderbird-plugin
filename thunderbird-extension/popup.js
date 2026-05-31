const bridgeUrlInput = document.getElementById("bridgeUrl");
const pinInput = document.getElementById("pin");
const statusBox = document.getElementById("statusBox");
const statusTitle = document.getElementById("statusTitle");
const statusDetail = document.getElementById("statusDetail");
const pairForm = document.getElementById("pairForm");
const pairButton = document.getElementById("pair");
const pairedPanel = document.getElementById("pairedPanel");
const pairedBridgeUrl = document.getElementById("pairedBridgeUrl");
const disconnectButton = document.getElementById("disconnect");
const toggleAccessButton = document.getElementById("toggleAccess");
const accessManager = document.getElementById("accessManager");
const accessSummary = document.getElementById("accessSummary");
const accountList = document.getElementById("accountList");
const saveAccessButton = document.getElementById("saveAccess");

let accessState = { mode: "all", allowedAccountIds: [], accounts: [] };

function message(name, substitutions) {
  return browser.i18n.getMessage(name, substitutions) || name;
}

function localize() {
  document.querySelectorAll("[data-i18n]").forEach(element => {
    element.textContent = message(element.dataset.i18n);
  });
}

async function loadStatus() {
  const settings = await browser.storage.local.get(["bridgeUrl", "token", "lastError", "lastSeen"]);
  if (settings.bridgeUrl) bridgeUrlInput.value = settings.bridgeUrl;
  renderStatus(settings);
  await loadAccess();
}

function renderStatus(settings) {
  statusBox.classList.remove("ok", "warning", "error");
  pairedPanel.classList.toggle("hidden", !settings.token);
  pairForm.classList.toggle("hidden", Boolean(settings.token));

  if (settings.bridgeUrl) pairedBridgeUrl.textContent = settings.bridgeUrl;

  if (settings.lastError) {
    statusBox.classList.add("error");
    statusTitle.textContent = message("statusBridgeError");
    statusDetail.textContent = settings.lastError;
    return;
  }
  if (settings.token) {
    statusBox.classList.add("ok");
    statusTitle.textContent = message("statusPaired");
    statusDetail.textContent = settings.lastSeen ? message("statusPairedSeen", formatTime(settings.lastSeen)) : message("statusPairedDetail");
    return;
  }

  statusBox.classList.add("warning");
  statusTitle.textContent = message("statusNotPaired");
  statusDetail.textContent = message("statusNotPairedDetail");
}

async function loadAccess() {
  accessState = await browser.runtime.sendMessage({ type: "getAccountsForAccess" });
  renderAccess();
}

function renderAccess() {
  const selected = accessState.allowedAccountIds.length;
  const total = accessState.accounts.length;
  accessSummary.textContent = accessState.mode === "all" ? message("accessSummaryAll", String(total)) : message("accessSummarySelected", [String(selected), String(total)]);
  document.querySelector(`input[name="accessMode"][value="${accessState.mode}"]`).checked = true;

  accountList.textContent = "";
  for (const account of accessState.accounts) {
    const label = document.createElement("label");
    label.className = "account";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = account.id;
    checkbox.checked = accessState.allowedAccountIds.includes(account.id);
    checkbox.disabled = accessState.mode === "all";

    const text = document.createElement("span");
    const name = document.createElement("strong");
    name.textContent = account.name || account.id;
    const detail = document.createElement("span");
    detail.textContent = accountEmailSummary(account);
    text.append(name, detail);
    label.append(checkbox, text);
    accountList.append(label);
  }
}

function accountEmailSummary(account) {
  const emails = (account.identities || []).map(identity => identity.email).filter(Boolean);
  if (!emails.length) return account.type || account.id;
  return emails.join(", ");
}

document.querySelectorAll("input[name='accessMode']").forEach(input => {
  input.addEventListener("change", () => {
    accessState.mode = input.value;
    renderAccess();
  });
});

toggleAccessButton.addEventListener("click", async () => {
  accessManager.classList.toggle("hidden");
  toggleAccessButton.textContent = accessManager.classList.contains("hidden") ? message("open") : message("close");
  if (!accessManager.classList.contains("hidden")) await loadAccess();
});

saveAccessButton.addEventListener("click", async () => {
  const checked = Array.from(accountList.querySelectorAll("input[type='checkbox']:checked")).map(input => input.value);
  saveAccessButton.disabled = true;
  try {
    accessState = await browser.runtime.sendMessage({
      type: "saveAccountAccess",
      mode: document.querySelector("input[name='accessMode']:checked").value,
      allowedAccountIds: checked
    });
    renderAccess();
  } finally {
    saveAccessButton.disabled = false;
  }
});

pairForm.addEventListener("submit", async event => {
  event.preventDefault();
  const bridgeUrl = bridgeUrlInput.value.replace(/\/$/, "");
  const pin = pinInput.value.trim();
  if (!isLoopbackBridge(bridgeUrl)) {
    renderTransientError(message("errorLoopback"));
    return;
  }
  if (!/^\d{6}$/.test(pin)) {
    renderTransientError(message("errorPin"));
    return;
  }

  pairButton.disabled = true;
  statusBox.classList.remove("ok", "error");
  statusBox.classList.add("warning");
  statusTitle.textContent = message("statusPairing");
  statusDetail.textContent = message("statusPairingDetail");
  try {
    const response = await fetch(`${bridgeUrl}/pair`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pin, extensionId: browser.runtime.id })
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || message("errorPairingFailed"));
    }

    const body = await response.json();
    await browser.storage.local.set({ bridgeUrl, token: body.token, lastError: "", lastSeen: "" });
    await browser.runtime.sendMessage({ type: "paired" });
    pinInput.value = "";
    renderStatus({ bridgeUrl, token: body.token, lastError: "", lastSeen: "" });
  } catch (error) {
    renderTransientError(error.message);
  } finally {
    pairButton.disabled = false;
  }
});

disconnectButton.addEventListener("click", async () => {
  await browser.storage.local.remove(["token", "lastError", "lastSeen"]);
  await browser.runtime.sendMessage({ type: "disconnect" });
  renderStatus({});
});

function renderTransientError(detail) {
  statusBox.classList.remove("ok", "warning");
  statusBox.classList.add("error");
  statusTitle.textContent = message("statusInputError");
  statusDetail.textContent = detail;
}

function isLoopbackBridge(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost");
  } catch {
    return false;
  }
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

localize();
browser.runtime.sendMessage({ type: "refreshStatus" }).catch(() => {});
loadStatus().catch(error => {
  renderTransientError(error.message);
});
