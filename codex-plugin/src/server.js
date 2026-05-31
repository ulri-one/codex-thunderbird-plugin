const http = require("http");
const path = require("path");
const { spawn } = require("child_process");

const HOST = "127.0.0.1";
const PORT = Number(process.env.CODEX_THUNDERBIRD_PORT || 17654);
const DAEMON_READY_TIMEOUT_MS = 8000;
let daemonStarting = null;

const tools = [
  tool("start_pairing", "Start or reuse the persistent local Thunderbird bridge daemon, create a short-lived PIN, and return the URL/PIN to paste into Thunderbird."),
  tool("get_status", "Get persistent bridge daemon, pairing, last-seen, and Thunderbird extension connection status."),
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

async function ensureDaemon() {
  const existing = await daemonStatus().catch(() => null);
  if (existing) return existing;
  if (daemonStarting) return daemonStarting;

  daemonStarting = (async () => {
    const child = startDaemonProcess();
    child.unref();

    const deadline = Date.now() + DAEMON_READY_TIMEOUT_MS;
    let lastError = null;
    while (Date.now() < deadline) {
      try {
        return await daemonStatus();
      } catch (error) {
        lastError = error;
        await delay(100);
      }
    }
    throw new Error(`Could not start Codex Thunderbird bridge daemon: ${lastError ? lastError.message : "not ready"}`);
  })();

  try {
    return await daemonStarting;
  } finally {
    daemonStarting = null;
  }
}

function startDaemonProcess() {
  const daemonPath = path.join(__dirname, "bridge-daemon.js");
  return spawn(process.execPath, [daemonPath], {
    cwd: process.cwd(),
    env: process.env,
    detached: true,
    stdio: "ignore",
    windowsHide: true
  });
}

async function daemonStatus() {
  return httpJson("GET", "/mcp/status");
}

async function daemonPost(pathname, body) {
  await ensureDaemon();
  return httpJson("POST", pathname, body || {});
}

function httpJson(method, pathname, body) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const req = http.request({
      host: HOST,
      port: PORT,
      path: pathname,
      method,
      timeout: 5000,
      headers: payload ? {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(payload)
      } : undefined
    }, res => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", chunk => {
        data += chunk;
      });
      res.on("end", () => {
        let parsed = {};
        try {
          parsed = data ? JSON.parse(data) : {};
        } catch (error) {
          reject(error);
          return;
        }
        if (res.statusCode >= 400) {
          reject(new Error(parsed.error || `Bridge daemon returned HTTP ${res.statusCode}`));
          return;
        }
        resolve(parsed);
      });
    });
    req.on("timeout", () => req.destroy(new Error("Bridge daemon request timed out")));
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
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

async function callTool(name, args) {
  if (name === "start_pairing") return daemonPost("/mcp/start_pairing");
  if (name === "get_status") return ensureDaemon();
  if (name === "revoke_pairing") return daemonPost("/mcp/revoke_pairing");
  if (name === "get_capabilities") return capabilities();

  const params = args || {};
  validateToolArgs(name, params);
  const response = await daemonPost("/mcp/call", { method: name, params });
  return response.result;
}

function capabilities() {
  return {
    pairingFlow: [
      "The plugin starts a persistent local bridge daemon when Codex loads the MCP server or when start_pairing is called.",
      "Call start_pairing in Codex.",
      "Open the Codex Thunderbird Plugin popup in Thunderbird.",
      "Paste the returned bridgeUrl and six-digit pin.",
      "Click Pair, then call get_status.",
      "Use Manage allowed accounts in Thunderbird to allow all accounts or selected accounts."
    ],
    securityModel: {
      localBridge: `The detached HTTP bridge daemon listens only on ${HOST}:${PORT}.`,
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

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

ensureDaemon().catch(error => {
  process.stderr.write(`Codex Thunderbird bridge daemon is not ready yet: ${error.message}\n`);
});

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
