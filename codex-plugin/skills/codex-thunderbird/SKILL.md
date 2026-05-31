---
name: codex-thunderbird
description: Use when the user asks to pair Thunderbird, check Thunderbird plugin status, list Thunderbird mail commands, or access Thunderbird accounts, folders, messages, tags, attachments, or sorting rules through Codex Thunderbird.
---

# Codex Thunderbird

Use the Codex Thunderbird MCP tools directly. Do not inspect the local plugin
bundle before trying the tools unless the MCP tool call fails.

## Pairing

1. Call `start_pairing`.
2. Tell the user to open the Thunderbird add-on popup.
3. Give the returned `bridgeUrl` and six-digit `pin`.
4. After the user pairs in Thunderbird, call `get_status`.

The local bridge is a persistent daemon on `127.0.0.1:17654`. The MCP helper
starts or reuses that daemon, so pairing credentials should remain usable even
if Codex restarts the MCP stdio process.

## Discovery

When the user asks what the plugin can do, call `get_capabilities`. Use the
returned command categories instead of guessing command names.

## Security

Thunderbird owns mailbox access. If a command fails with a `Manage allowed
accounts` message, tell the user to open the Thunderbird add-on popup and allow
the account or switch to all-account access.
