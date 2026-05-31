const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const HOST = "127.0.0.1";
const PORT = Number(process.env.CODEX_THUNDERBIRD_PORT || 17654);
const REQUEST_TIMEOUT_MS = clampEnvNumber("CODEX_THUNDERBIRD_REQUEST_TIMEOUT_MS", 60000, 5000, 300000);
const POLL_TIMEOUT_MS = clampEnvNumber("CODEX_THUNDERBIRD_POLL_TIMEOUT_MS", 15000, 1000, 60000);
const PAIRING_TTL_MS = 120000;
const MAX_BODY_BYTES = 1024 * 1024;
const MAX_PENDING_REQUESTS = 100;
const DEFAULT_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
const MAX_ATTACHMENT_MAX_BYTES = 50 * 1024 * 1024;
const DEFAULT_ATTACHMENT_CHUNK_BYTES = 1024 * 1024;

const stateDir = process.env.CODEX_THUNDERBIRD_STATE_DIR || path.join(process.cwd(), ".codex-thunderbird-state");
const stateFile = path.join(stateDir, "state.json");

let persisted = loadState();
saveState();
let pairing = null;
let failedPairAttempts = [];
let extensionId = null;
let lastSeenAt = null;
let scopes = [];
let pending = [];
let waiters = new Map();
let pollWaiters = [];

function clampEnvNumber(name, fallback, min, max) {
  const value = Number(process.env[name] || fallback);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(value, min), max);
}

function loadState() {
  try {
    return normalizeState(JSON.parse(fs.readFileSync(stateFile, "utf8")));
  } catch {
    return normalizeState({});
  }
}

function saveState() {
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(stateFile, JSON.stringify(serializeState(persisted), null, 2));
}

function normalizeState(value) {
  return {
    token: typeof value.token === "string" ? value.token : null
  };
}

function serializeState(value) {
  return {
    token: value.token || null
  };
}

function headers(extra) {
  return Object.assign({
    "content-type": "application/json",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "authorization,content-type"
  }, extra || {});
}

function sendJson(res, status, body) {
  res.writeHead(status, headers());
  res.end(JSON.stringify(body));
}

function isLoopback(req) {
  const remote = req.socket.remoteAddress;
  return remote === "127.0.0.1" || remote === "::1" || remote === "::ffff:127.0.0.1";
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => {
      data += chunk;
      if (Buffer.byteLength(data) > MAX_BODY_BYTES) req.destroy(new Error("Request body too large"));
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

async function handleHttp(req, res) {
  if (!isLoopback(req)) {
    sendJson(res, 403, { error: "Loopback only" });
    return;
  }

  const url = new URL(req.url, `http://${HOST}:${PORT}`);

  try {
    if (req.method === "OPTIONS") {
      res.writeHead(204, headers());
      res.end();
      return;
    }

    if (req.method === "GET" && url.pathname === "/mcp/status") {
      sendJson(res, 200, status());
      return;
    }

    if (req.method === "POST" && url.pathname === "/mcp/start_pairing") {
      sendJson(res, 200, startPairing());
      return;
    }

    if (req.method === "POST" && url.pathname === "/mcp/revoke_pairing") {
      sendJson(res, 200, revokePairing());
      return;
    }

    if (req.method === "POST" && url.pathname === "/mcp/call") {
      const body = await readBody(req);
      const result = await callThunderbird(body.method, body.params || {});
      sendJson(res, 200, { result });
      return;
    }

    if (req.method === "POST" && url.pathname === "/pair") {
      const body = await readBody(req);
      if (isPairRateLimited()) {
        sendJson(res, 429, { error: "Too many pairing attempts. Try again shortly." });
        return;
      }
      if (!pairing || Date.now() > pairing.expiresAt || body.pin !== pairing.pin) {
        recordFailedPairAttempt();
        sendJson(res, 401, { error: "Invalid or expired PIN" });
        return;
      }

      persisted.token = crypto.randomBytes(32).toString("hex");
      extensionId = body.extensionId || "unknown";
      lastSeenAt = new Date().toISOString();
      pairing = null;
      saveState();
      sendJson(res, 200, { token: persisted.token });
      return;
    }

    if (url.pathname === "/v1/requests") {
      if (!authorize(getBearerToken(req))) {
        sendJson(res, 401, { error: "Unauthorized" });
        return;
      }

      lastSeenAt = new Date().toISOString();
      await sendPendingOrWait(res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/v1/responses") {
      const body = await readBody(req);
      if (!authorize(getBearerToken(req))) {
        sendJson(res, 401, { error: "Unauthorized" });
        return;
      }

      lastSeenAt = new Date().toISOString();
      const waiter = waiters.get(body.id);
      if (waiter) {
        waiters.delete(body.id);
        body.error ? waiter.reject(new Error(body.error)) : waiter.resolve(body.result);
      }
      sendJson(res, 200, { ok: true });
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}

function status() {
  return {
    bridgeUrl: `http://${HOST}:${PORT}`,
    bridgeStarted: true,
    daemonPid: process.pid,
    paired: Boolean(persisted.token),
    pairingExpiresAt: pairing && Date.now() <= pairing.expiresAt ? new Date(pairing.expiresAt).toISOString() : null,
    extensionId,
    lastSeenAt,
    scopes
  };
}

function startPairing() {
  pairing = {
    pin: String(crypto.randomInt(0, 1000000)).padStart(6, "0"),
    expiresAt: Date.now() + PAIRING_TTL_MS
  };
  return {
    bridgeUrl: `http://${HOST}:${PORT}`,
    pin: pairing.pin,
    expiresAt: new Date(pairing.expiresAt).toISOString(),
    daemonPid: process.pid
  };
}

function revokePairing() {
  persisted.token = null;
  extensionId = null;
  lastSeenAt = null;
  scopes = [];
  pairing = null;
  pending = [];
  for (const waiter of waiters.values()) waiter.reject(new Error("Pairing revoked"));
  waiters.clear();
  saveState();
  return { paired: false, daemonPid: process.pid };
}

function getBearerToken(req) {
  const value = req.headers.authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(value);
  return match ? match[1] : "";
}

function authorize(token) {
  if (!persisted.token || !token) return false;
  const actual = Buffer.from(token);
  const expected = Buffer.from(persisted.token);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function isPairRateLimited() {
  const cutoff = Date.now() - 60000;
  failedPairAttempts = failedPairAttempts.filter(time => time >= cutoff);
  return failedPairAttempts.length >= 10;
}

function recordFailedPairAttempt() {
  failedPairAttempts.push(Date.now());
}

function sendPendingOrWait(res) {
  if (pending.length) {
    sendJson(res, 200, { requests: pending.splice(0, 5) });
    return Promise.resolve();
  }

  return new Promise(resolve => {
    const waiter = {
      res,
      resolve,
      timeout: setTimeout(() => {
        pollWaiters = pollWaiters.filter(item => item !== waiter);
        sendJson(res, 200, { requests: [] });
        resolve();
      }, POLL_TIMEOUT_MS)
    };
    pollWaiters.push(waiter);
  });
}

function flushPollWaiters() {
  while (pending.length && pollWaiters.length) {
    const waiter = pollWaiters.shift();
    clearTimeout(waiter.timeout);
    sendJson(waiter.res, 200, { requests: pending.splice(0, 5) });
    waiter.resolve();
  }
}

function normalizeParams(method, params) {
  const normalized = params || {};
  if (method === "get_attachment") {
    normalized.maxBytes = clampNumber(normalized.maxBytes, DEFAULT_ATTACHMENT_MAX_BYTES, 1, MAX_ATTACHMENT_MAX_BYTES);
  }
  if (method === "get_attachment_chunk") {
    normalized.offset = Math.max(Number(normalized.offset || 0), 0);
    normalized.length = clampNumber(normalized.length, DEFAULT_ATTACHMENT_CHUNK_BYTES, 1, DEFAULT_ATTACHMENT_CHUNK_BYTES);
  }
  return normalized;
}

function clampNumber(value, fallback, min, max) {
  const numeric = Number(value || fallback);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(Math.max(numeric, min), max);
}

function callThunderbird(method, params) {
  if (method === "add_inbox") {
    if (!scopes.includes(params.scope)) scopes.push(params.scope);
    return { scopes };
  }
  if (method === "remove_inbox") {
    scopes = scopes.filter(scope => scope !== params.scope);
    return { scopes };
  }

  if (!persisted.token) {
    throw new Error("Thunderbird extension is not paired. Call start_pairing first.");
  }
  const normalized = normalizeParams(method, params || {});
  if (pending.length >= MAX_PENDING_REQUESTS) throw new Error("Too many pending Thunderbird requests");

  const id = crypto.randomUUID();
  pending.push({ id, method, params: normalized });
  flushPollWaiters();

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      waiters.delete(id);
      reject(new Error("Timed out waiting for Thunderbird extension"));
    }, REQUEST_TIMEOUT_MS);

    waiters.set(id, {
      resolve: value => {
        clearTimeout(timeout);
        resolve(value);
      },
      reject: error => {
        clearTimeout(timeout);
        reject(error);
      }
    });
  });
}

const server = http.createServer(handleHttp);
server.on("error", error => {
  if (error.code === "EADDRINUSE") {
    process.exit(0);
    return;
  }
  process.stderr.write(`Codex Thunderbird Plugin bridge failed: ${error.message}\n`);
  process.exit(1);
});
server.listen(PORT, HOST);
