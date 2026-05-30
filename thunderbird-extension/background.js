let polling = false;
let stopped = false;

browser.runtime.onMessage.addListener(message => {
  if (message.type === "paired") {
    stopped = false;
    pollLoop();
  }
  if (message.type === "disconnect") stopped = true;
});

browser.runtime.onStartup.addListener(() => {
  stopped = false;
  pollLoop();
});

pollLoop();

async function pollLoop() {
  if (polling) return;
  polling = true;

  while (!stopped) {
    const settings = await browser.storage.local.get(["bridgeUrl", "token"]);
    if (!settings.bridgeUrl || !settings.token) break;

    try {
      const response = await fetch(`${settings.bridgeUrl}/v1/requests`, {
        headers: authHeaders(settings.token)
      });
      if (response.ok) {
        const body = await response.json();
        for (const request of body.requests || []) {
          await handleBridgeRequest(settings.bridgeUrl, settings.token, request);
        }
      }
      await browser.storage.local.set({ lastError: "", lastSeen: new Date().toISOString() });
    } catch (error) {
      await browser.storage.local.set({ lastError: error.message });
      await delay(2000);
    }

    await delay(250);
  }

  polling = false;
}

async function handleBridgeRequest(bridgeUrl, token, request) {
  let payload;
  try {
    payload = { id: request.id, result: await dispatch(request.method, request.params || {}) };
  } catch (error) {
    payload = { id: request.id, error: error.message };
  }

  await fetch(`${bridgeUrl}/v1/responses`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload)
  });
}

async function dispatch(method, params) {
  if (method === "list_accounts") return summarizeAccounts(await browser.accounts.list());
  if (method === "list_folders") {
    const account = await browser.accounts.get(params.accountId);
    return params.includeSubFolders ? account.folders : shallowFolders(account.folders || []);
  }
  if (method === "create_folder") return callRequired(browser.folders, "create", params.parentFolderId, params.name);
  if (method === "rename_folder") return callRequired(browser.folders, "rename", params.folderId, params.name);
  if (method === "delete_folder") return callRequired(browser.folders, "delete", params.folderId);
  if (method === "search_messages") return collectMessagePages(() => browser.messages.query(params.query || {}), params);
  if (method === "list_messages") {
    const folder = params.folderId || await findFolder(params.accountId, params.path);
    return collectMessagePages(() => browser.messages.list(folder), params);
  }
  if (method === "read_message") {
    const header = await browser.messages.get(params.messageId);
    const full = params.includeFull ? await browser.messages.getFull(params.messageId) : null;
    return { header, full };
  }
  if (method === "update_message_flags") {
    const properties = pickDefined(params, ["read", "flagged", "junk", "new"]);
    await browser.messages.update(params.messageId, properties);
    return browser.messages.get(params.messageId);
  }
  if (method === "move_messages") {
    await browser.messages.move(params.messageIds, params.destinationFolderId, { isUserAction: params.isUserAction !== false });
    return { moved: params.messageIds.length, destinationFolderId: params.destinationFolderId };
  }
  if (method === "copy_messages") {
    await browser.messages.copy(params.messageIds, params.destinationFolderId, { isUserAction: params.isUserAction !== false });
    return { copied: params.messageIds.length, destinationFolderId: params.destinationFolderId };
  }
  if (method === "archive_messages") {
    await browser.messages.archive(params.messageIds);
    return { archived: params.messageIds.length };
  }
  if (method === "delete_messages") {
    await browser.messages.delete(params.messageIds, { deletePermanently: params.deletePermanently === true, isUserAction: params.isUserAction !== false });
    return { deleted: params.messageIds.length, deletePermanently: params.deletePermanently === true };
  }
  if (method === "list_tags") return tagApi("list");
  if (method === "create_tag") {
    await tagApi("create", params.key, params.tag, params.color);
    return tagApi("list");
  }
  if (method === "update_tag") {
    await tagApi("update", params.key, pickDefined(params, ["tag", "color"]));
    return tagApi("list");
  }
  if (method === "delete_tag") {
    await tagApi("delete", params.key);
    return tagApi("list");
  }
  if (method === "set_message_tags") {
    await browser.messages.update(params.messageId, { tags: params.tags });
    return browser.messages.get(params.messageId);
  }
  if (method === "list_attachments") return browser.messages.listAttachments(params.messageId);
  if (method === "get_attachment") return readAttachment(params.messageId, params.partName, 0, params.maxBytes, false);
  if (method === "get_attachment_chunk") return readAttachment(params.messageId, params.partName, params.offset, params.length, true);
  if (method === "save_attachment") return saveAttachment(params);
  if (method === "list_rules") return getRules();
  if (method === "create_rule") return createRule(params.rule);
  if (method === "update_rule") return updateRule(params.id, params.patch);
  if (method === "delete_rule") return deleteRule(params.id);
  if (method === "run_rule") return runRule(params.id, params);
  throw new Error(`Unsupported method: ${method}`);
}

function authHeaders(token) {
  return {
    "authorization": `Bearer ${token}`,
    "content-type": "application/json"
  };
}

function summarizeAccounts(accounts) {
  return accounts.map(account => ({
    id: account.id,
    name: account.name,
    type: account.type,
    identities: (account.identities || []).map(identity => ({
      id: identity.id,
      label: identity.label,
      name: identity.name,
      email: identity.email
    })),
    emailAddresses: (account.identities || []).map(identity => identity.email).filter(Boolean),
    folders: shallowFolders(account.folders || [])
  }));
}

function shallowFolders(folders) {
  return folders.map(folder => ({
    id: folder.id,
    accountId: folder.accountId,
    name: folder.name,
    path: folder.path,
    type: folder.type,
    specialUse: folder.specialUse,
    subFolderCount: (folder.subFolders || []).length
  }));
}

async function findFolder(accountId, folderPath) {
  if (!accountId || !folderPath) throw new Error("list_messages requires folderId or accountId and path");

  const account = await browser.accounts.get(accountId);
  const stack = [...(account.folders || [])];
  while (stack.length) {
    const folder = stack.shift();
    if (folder.path === folderPath) return folder.id || folder;
    stack.push(...(folder.subFolders || []));
  }
  throw new Error(`Folder not found: ${folderPath}`);
}

async function collectMessagePages(firstPageFactory, params) {
  const limit = Math.max(Number(params.limit || 50), 1);
  const includeAllPages = params.includeAllPages === true;
  let page = await firstPageFactory();
  const messages = [];

  while (page) {
    messages.push(...(page.messages || []));
    if (messages.length >= limit || !includeAllPages || !page.id) break;
    page = await browser.messages.continueList(page.id);
  }

  return messages.slice(0, limit).map(messageSummary);
}

function messageSummary(message) {
  return {
    id: message.id,
    author: message.author,
    recipients: message.recipients,
    ccList: message.ccList,
    bccList: message.bccList,
    subject: message.subject,
    date: message.date,
    read: message.read,
    flagged: message.flagged,
    junk: message.junk,
    tags: message.tags,
    size: message.size,
    folder: message.folder
  };
}

async function readAttachment(messageId, partName, offset, length, chunked) {
  const file = await browser.messages.getAttachmentFile(messageId, partName);
  if (!chunked && file.size > length) {
    throw new Error(`Attachment is ${file.size} bytes, above the ${length} byte limit. Use get_attachment_chunk or save_attachment.`);
  }

  const start = Math.min(offset || 0, file.size);
  const end = Math.min(start + length, file.size);
  const blob = file.slice(start, end);
  return {
    name: file.name,
    type: file.type,
    size: file.size,
    offset: start,
    length: end - start,
    done: end >= file.size,
    base64: await blobToBase64(blob)
  };
}

async function saveAttachment(params) {
  if (!browser.downloads || !browser.downloads.download) {
    throw new Error("Thunderbird downloads API is unavailable in this version/profile");
  }
  const file = await browser.messages.getAttachmentFile(params.messageId, params.partName);
  const url = URL.createObjectURL(file);
  try {
    const downloadId = await browser.downloads.download({
      url,
      filename: params.filename || file.name,
      conflictAction: params.conflictAction || "uniquify",
      saveAs: false
    });
    return { downloadId, filename: params.filename || file.name, size: file.size };
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1] || "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function pickDefined(source, keys) {
  const output = {};
  for (const key of keys) {
    if (source[key] !== undefined) output[key] = source[key];
  }
  return output;
}

async function callRequired(namespace, method, ...args) {
  if (!namespace || !namespace[method]) throw new Error(`Thunderbird API unavailable: ${method}`);
  return namespace[method](...args);
}

async function tagApi(action, ...args) {
  const legacy = {
    list: "listTags",
    create: "createTag",
    update: "updateTag",
    delete: "deleteTag"
  };
  if (browser.messages && browser.messages[legacy[action]]) {
    return browser.messages[legacy[action]](...args);
  }
  if (browser.messages && browser.messages.tags && browser.messages.tags[action]) {
    return browser.messages.tags[action](...args);
  }
  throw new Error(`Thunderbird tag API unavailable: ${action}`);
}

async function getRules() {
  const data = await browser.storage.local.get(["sortingRules"]);
  return data.sortingRules || [];
}

async function setRules(rules) {
  await browser.storage.local.set({ sortingRules: rules });
  return rules;
}

async function createRule(rule) {
  const rules = await getRules();
  const next = {
    id: rule.id || cryptoRandomId(),
    name: rule.name || "New rule",
    enabled: rule.enabled !== false,
    query: rule.query || {},
    actions: Array.isArray(rule.actions) ? rule.actions : [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  rules.push(next);
  await setRules(rules);
  return next;
}

async function updateRule(id, patch) {
  const rules = await getRules();
  const index = rules.findIndex(rule => rule.id === id);
  if (index < 0) throw new Error(`Rule not found: ${id}`);
  rules[index] = Object.assign({}, rules[index], patch, { id, updatedAt: new Date().toISOString() });
  await setRules(rules);
  return rules[index];
}

async function deleteRule(id) {
  const rules = await getRules();
  const next = rules.filter(rule => rule.id !== id);
  await setRules(next);
  return { deleted: rules.length - next.length, rules: next };
}

async function runRule(id, params) {
  const rule = (await getRules()).find(item => item.id === id);
  if (!rule) throw new Error(`Rule not found: ${id}`);
  if (rule.enabled === false) return { matched: 0, acted: 0, dryRun: params.dryRun === true, disabled: true };

  const messages = await collectMessagePages(() => browser.messages.query(rule.query || {}), {
    limit: params.limit || 100,
    includeAllPages: true
  });
  if (params.dryRun === true) return { matched: messages.length, acted: 0, dryRun: true, messages };

  for (const action of rule.actions || []) {
    await runRuleAction(action, messages.map(message => message.id));
  }
  return { matched: messages.length, acted: messages.length, dryRun: false };
}

async function runRuleAction(action, messageIds) {
  if (!messageIds.length) return;
  if (action.type === "move") return browser.messages.move(messageIds, action.destinationFolderId, { isUserAction: false });
  if (action.type === "copy") return browser.messages.copy(messageIds, action.destinationFolderId, { isUserAction: false });
  if (action.type === "delete") return browser.messages.delete(messageIds, { deletePermanently: action.deletePermanently === true, isUserAction: false });
  if (action.type === "archive") return browser.messages.archive(messageIds);
  if (action.type === "markRead") return Promise.all(messageIds.map(id => browser.messages.update(id, { read: true })));
  if (action.type === "flag") return Promise.all(messageIds.map(id => browser.messages.update(id, { flagged: true })));
  if (action.type === "tag") return Promise.all(messageIds.map(id => browser.messages.update(id, { tags: action.tags || [] })));
  throw new Error(`Unsupported rule action: ${action.type}`);
}

function cryptoRandomId() {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, "0")).join("");
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
