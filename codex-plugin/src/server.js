const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const HOST = "127.0.0.1";
const PORT = Number(process.env.CODEX_THUNDERBIRD_PORT || 17654);
const REQUEST_TIMEOUT_MS = clampEnvNumber("CODEX_THUNDERBIRD_REQUEST_TIMEOUT_MS", 45000, 5000, 300000);
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
let pairing = null;
let failedPairAttempts = [];
let pending = [];
let waiters = new Map();
let pollWaiters = [];
let bridgeServer = null;
let bridgeStarted = false;
let bridgeStarting = null;

const tools = [
  tool("start_pairing", "Start the local bridge on 127.0.0.1, create a short-lived PIN, and return the URL/PIN to paste into Thunderbird."),
  tool("get_status", "Get local bridge, pairing, last-seen, and Thunderbird extension connection status."),
  tool("revoke_pairing", "Revoke the current Thunderbird extension token and clear pending requests."),
  tool("get_capabilities", "Show pairing steps, mailbox access rules, command categories, and every supported Thunderbird command."),
  tool("list_accounts", "List Thunderbird accounts. Accounts blocked in Thunderbird Manage allowed accounts are returned with sensitive email details redacted."),
  tool("list_folders", "List folders for a Thunderbird account.", { accountId: str(), includeSubFolders: bool() }, ["accountId"]),
  tool("create_folder", "Create a folder under a parent Thunderbird folder.", { parentFolderId: str(), name: str() }, ["parentFolderId", "name"]),
  tool("rename_folder", "Rename a Thunderbird folder.", { folderId: str(), name: str() }, ["folderId", "name"]),
  tool("delete_folder", "Delete a Thunderbird folder.", { folderId: str() }, ["folderId"]),
  tool("search_messages", "Search Thunderbird messages using Thunderbird query fields.", {
    query: obj(),
    limit: num(),
    includeAllPages: bool()
  }),
  tool("list_messages", "List message headers in a Thunderbird folder.", {
    folderId: str(),
    accountId: str(),
    path: str(),
    limit: num(),
    includeAllPages: bool()
  }),
  tool("read_message", "Read a single Thunderbird message with optional full MIME tree.", {
    messageId: num(),
    includeFull: bool()
  }, ["messageId"]),
  tool("update_message_flags", "Set read, flagged/starred, junk, or new-state properties on one message.", {
    messageId: num(),
    read: bool(),
    flagged: bool(),
    junk: bool(),
    new: bool()
  }, ["messageId"]),
  tool("move_messages", "Move messages to a Thunderbird folder.", {
    messageIds: arr(),
    destinationFolderId: str(),
    isUserAction: bool()
  }, ["messageIds", "destinationFolderId"]),
  tool("copy_messages", "Copy messages to a Thunderbird folder.", {
    messageIds: arr(),
    destinationFolderId: str(),
    isUserAction: bool()
  }, ["messageIds", "destinationFolderId"]),
  tool("archive_messages", "Archive messages using Thunderbird archive settings.", { messageIds: arr() }, ["messageIds"]),
  tool("delete_messages", "Delete messages, optionally permanently.", {
    messageIds: arr(),
    deletePermanently: bool(),
    isUserAction: bool()
  }, ["messageIds"]),
  tool("list_tags", "List Thunderbird message tags/labels."),
  tool("create_tag", "Create a Thunderbird message tag/label.", {
    key: str(),
    tag: str(),
    color: str()
  }, ["key", "tag", "color"]),
  tool("update_tag", "Rename or recolor a Thunderbird message tag/label.", {
    key: str(),
    tag: str(),
    color: str()
  }, ["key"]),
  tool("delete_tag", "Delete a Thunderbird message tag/label definition.", { key: str() }, ["key"]),
  tool("set_message_tags", "Replace the tags/labels on a message.", {
    messageId: num(),
    tags: arr()
  }, ["messageId", "tags"]),
  tool("list_attachments", "List attachments for a Thunderbird message.", { messageId: num() }, ["messageId"]),
  tool("get_attachment", "Get one attachment as base64 content, capped by maxBytes.", {
    messageId: num(),
    partName: str(),
    maxBytes: num()
  }, ["messageId", "partName"]),
  tool("get_attachment_chunk", "Read a slice of a large attachment as base64.", {
    messageId: num(),
    partName: str(),
    offset: num(),
    length: num()
  }, ["messageId", "partName"]),
  tool("save_attachment", "Save an attachment through Thunderbird's downloads API.", {
    messageId: num(),
    partName: str(),
    filename: str(),
    conflictAction: str()
  }, ["messageId", "partName"]),
  tool("list_rules", "List extension-local sorting rules."),
  tool("create_rule", "Create an extension-local sorting rule.", {
    rule: obj()
  }, ["rule"]),
  tool("update_rule", "Update an extension-local sorting rule.", {
    id: str(),
    patch: obj()
  }, ["id", "patch"]),
  tool("delete_rule", "Delete an extension-local sorting rule.", { id: str() }, ["id"]),
  tool("run_rule", "Run an extension-local sorting rule against matching messages.", {
    id: str(),
    dryRun: bool(),
    limit: num()
  }, ["id"]),
  tool("add_inbox", "Legacy Codex-side scope note. Thunderbird-side Manage allowed accounts is the enforced mailbox access control.", { scope: str() }, ["scope"]),
  tool("remove_inbox", "Remove a legacy Codex-side scope note. Use Thunderbird Manage allowed accounts for enforced access control.", { scope: str() }, ["scope"])
];

function tool(name, description, properties, required) {
  return {
    name,
    description,
    inputSchema: {
      type: "object",
      properties: properties || {},
      required: required || []
    }
  };
}

function str() {
  return { type: "string" };
}

function num() {
  return { type: "number" };
}

function bool() {
  return { type: "boolean" };
}

function arr() {
  return { type: "array" };
}

function obj() {
  return { type: "object" };
}

function clampEnvNumber(name, fallback, min, max) {
  const value = Number(process.env[name] || fallback);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(value, min), max);
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(stateFile, "utf8"));
  } catch {
    return { token: null, scopes: [], lastSeenAt: null };
  }
}

function saveState() {
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(stateFile, JSON.stringify(persisted, null, 2));
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
      persisted.extensionId = body.extensionId || "unknown";
      persisted.lastSeenAt = new Date().toISOString();
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

      persisted.lastSeenAt = new Date().toISOString();
      saveState();
      await sendPendingOrWait(res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/v1/responses") {
      const body = await readBody(req);
      if (!authorize(getBearerToken(req))) {
        sendJson(res, 401, { error: "Unauthorized" });
        return;
      }

      persisted.lastSeenAt = new Date().toISOString();
      saveState();
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

async function startBridge() {
  if (bridgeStarted) return;
  if (bridgeStarting) return bridgeStarting;
  bridgeStarting = new Promise((resolve, reject) => {
    const server = http.createServer(handleHttp);
    server.on("error", error => {
      if (!bridgeStarted) {
        bridgeServer = null;
        bridgeStarting = null;
        reject(error);
        return;
      }
      process.stderr.write(`Codex Thunderbird Plugin bridge failed: ${error.message}\n`);
    });
    server.listen(PORT, HOST, () => {
      bridgeServer = server;
      bridgeStarted = true;
      bridgeStarting = null;
      resolve();
    });
  });
  await bridgeStarting;
}

async function startPairing() {
  await startBridge();
  pairing = {
    pin: String(crypto.randomInt(0, 1000000)).padStart(6, "0"),
    expiresAt: Date.now() + PAIRING_TTL_MS
  };
  return {
    bridgeUrl: `http://${HOST}:${PORT}`,
    pin: pairing.pin,
    expiresAt: new Date(pairing.expiresAt).toISOString()
  };
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

function validateToolArgs(method, params) {
  const known = tools.find(item => item.name === method);
  if (!known) throw new Error(`Unknown tool: ${method}`);
  for (const key of known.inputSchema.required || []) {
    if (params[key] === undefined || params[key] === null || params[key] === "") {
      throw new Error(`${key} is required`);
    }
  }
  if (method === "list_messages" && !params.folderId && (!params.accountId || !params.path)) {
    throw new Error("folderId or accountId and path are required");
  }
}

function enqueue(method, params) {
  if (!persisted.token) {
    throw new Error("Thunderbird extension is not paired. Call start_pairing first.");
  }
  const normalized = normalizeParams(method, params || {});
  validateToolArgs(method, normalized);
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

async function callTool(name, args) {
  if (name === "start_pairing") return startPairing();
  if (name === "get_status") {
    return {
      bridgeUrl: `http://${HOST}:${PORT}`,
      bridgeStarted,
      paired: Boolean(persisted.token),
      extensionId: persisted.extensionId || null,
      lastSeenAt: persisted.lastSeenAt || null,
      scopes: persisted.scopes || []
    };
  }
  if (name === "revoke_pairing") {
    persisted.token = null;
    persisted.extensionId = null;
    persisted.lastSeenAt = null;
    pending = [];
    for (const waiter of waiters.values()) waiter.reject(new Error("Pairing revoked"));
    waiters.clear();
    saveState();
    return { paired: false };
  }
  if (name === "get_capabilities") return capabilities();
  if (name === "add_inbox") {
    if (!persisted.scopes.includes(args.scope)) persisted.scopes.push(args.scope);
    saveState();
    return { scopes: persisted.scopes };
  }
  if (name === "remove_inbox") {
    persisted.scopes = persisted.scopes.filter(scope => scope !== args.scope);
    saveState();
    return { scopes: persisted.scopes };
  }
  await startBridge();
  return enqueue(name, args);
}

function capabilities() {
  return {
    pairingFlow: [
      "Call start_pairing in Codex.",
      "Open the Codex Thunderbird Plugin popup in Thunderbird.",
      "Paste the returned bridgeUrl and six-digit pin.",
      "Click Pair, then call get_status.",
      "Use Manage allowed accounts in Thunderbird to allow all accounts or selected accounts."
    ],
    securityModel: {
      localBridge: `The HTTP bridge listens only on ${HOST}:${PORT} and starts lazily when start_pairing or a Thunderbird command needs it.`,
      pairing: "Pairing uses a short-lived PIN and a local bearer token stored by the Thunderbird extension.",
      mailboxAccess: "Thunderbird enforces Manage allowed accounts. Blocked accounts stay visible in list_accounts with email details redacted, and non-allowed mail commands return an error that names Manage allowed accounts."
    },
    account: ["list_accounts", "list_folders"],
    folders: ["create_folder", "rename_folder", "delete_folder", "move_messages", "copy_messages"],
    email: ["search_messages", "list_messages", "read_message", "update_message_flags", "archive_messages", "delete_messages"],
    tags: ["list_tags", "create_tag", "update_tag", "delete_tag", "set_message_tags"],
    attachments: ["list_attachments", "get_attachment", "get_attachment_chunk", "save_attachment"],
    rules: ["list_rules", "create_rule", "update_rule", "delete_rule", "run_rule"],
    pairing: ["start_pairing", "get_status", "revoke_pairing", "get_capabilities"],
    legacyCodexScopes: ["add_inbox", "remove_inbox"]
  };
}

function writeRpc(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

async function handleRpc(line) {
  const request = JSON.parse(line);
  if (!request.id) return;

  try {
    if (request.method === "initialize") {
      writeRpc({
        jsonrpc: "2.0",
        id: request.id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "codex-thunderbird", version: "1.0.0" }
        }
      });
      return;
    }

    if (request.method === "tools/list") {
      writeRpc({ jsonrpc: "2.0", id: request.id, result: { tools } });
      return;
    }

    if (request.method === "tools/call") {
      const result = await callTool(request.params.name, request.params.arguments || {});
      writeRpc({
        jsonrpc: "2.0",
        id: request.id,
        result: { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }
      });
      return;
    }

    writeRpc({ jsonrpc: "2.0", id: request.id, error: { code: -32601, message: "Method not found" } });
  } catch (error) {
    writeRpc({ jsonrpc: "2.0", id: request.id, error: { code: -32000, message: error.message } });
  }
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => {
  buffer += chunk;
  const lines = buffer.split(/\r?\n/);
  buffer = lines.pop();
  for (const line of lines) {
    if (line.trim()) handleRpc(line).catch(error => writeRpc({ jsonrpc: "2.0", error: { code: -32000, message: error.message } }));
  }
});
