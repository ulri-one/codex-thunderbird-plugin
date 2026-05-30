const bridgeUrlInput = document.getElementById("bridgeUrl");
const pinInput = document.getElementById("pin");
const statusText = document.getElementById("status");
const pairButton = document.getElementById("pair");
const disconnectButton = document.getElementById("disconnect");

async function loadStatus() {
  const settings = await browser.storage.local.get(["bridgeUrl", "token", "lastError", "lastSeen"]);
  if (settings.bridgeUrl) bridgeUrlInput.value = settings.bridgeUrl;
  renderStatus(settings);
}

function renderStatus(settings) {
  statusText.classList.toggle("paired", Boolean(settings.token));
  if (settings.lastError) {
    statusText.textContent = settings.lastError;
    return;
  }
  if (settings.token) {
    statusText.textContent = settings.lastSeen ? `Paired, last seen ${formatTime(settings.lastSeen)}` : "Paired and polling locally";
    return;
  }
  statusText.textContent = "Not paired";
}

document.getElementById("pairForm").addEventListener("submit", async event => {
  event.preventDefault();
  const bridgeUrl = bridgeUrlInput.value.replace(/\/$/, "");
  const pin = pinInput.value.trim();
  if (!isLoopbackBridge(bridgeUrl)) {
    statusText.textContent = "Bridge URL must be localhost or 127.0.0.1";
    return;
  }
  if (!/^\d{6}$/.test(pin)) {
    statusText.textContent = "Enter the six-digit PIN from Codex";
    return;
  }

  pairButton.disabled = true;
  statusText.textContent = "Pairing...";
  try {
    const response = await fetch(`${bridgeUrl}/pair`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pin, extensionId: browser.runtime.id })
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || "Pairing failed");
    }

    const body = await response.json();
    await browser.storage.local.set({ bridgeUrl, token: body.token, lastError: "", lastSeen: "" });
    await browser.runtime.sendMessage({ type: "paired" });
    pinInput.value = "";
    statusText.classList.add("paired");
    statusText.textContent = "Paired and polling locally";
  } catch (error) {
    statusText.classList.remove("paired");
    statusText.textContent = error.message;
  } finally {
    pairButton.disabled = false;
  }
});

disconnectButton.addEventListener("click", async () => {
  await browser.storage.local.remove(["token", "lastError", "lastSeen"]);
  await browser.runtime.sendMessage({ type: "disconnect" });
  statusText.classList.remove("paired");
  statusText.textContent = "Not paired";
});

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

loadStatus().catch(error => {
  statusText.textContent = error.message;
});
