# Architecture

## Summary

Codex cannot safely reach into Thunderbird directly without either a local tool
or a plugin. This solution is a two-part local bridge:

1. The Codex plugin runs a lightweight MCP server over stdio.
2. The MCP server starts or reuses a separate local bridge daemon.
3. The bridge daemon exposes HTTP bound only to `127.0.0.1`.
4. Thunderbird runs a MailExtension with a small popup UI.
5. The user starts pairing from Codex, enters the one-time PIN in Thunderbird,
   and the extension receives a local API token.
6. When Codex calls an MCP mail tool, the bridge daemon queues a local request.
7. The Thunderbird extension polls for work, executes Thunderbird APIs, and
   posts the result back to the bridge.

This avoids external networking and avoids parsing Thunderbird profile internals.

## Why not direct profile access?

Directly reading Thunderbird profile files is brittle and privacy-sensitive:

- Thunderbird profile formats can change.
- IMAP folders may not be fully synchronized locally.
- Attachments and message bodies may be missing until Thunderbird downloads them.
- Locking and concurrent reads can corrupt assumptions while Thunderbird runs.
- Account credentials should stay inside Thunderbird's existing credential model.

## Local protocol

The bridge uses loopback HTTP:

- `POST /pair` - exchange a one-time PIN for a generated token.
- `GET /v1/requests?token=...` - Thunderbird pulls pending work.
- `POST /v1/responses` - Thunderbird returns request results.

The bridge rejects non-loopback remote addresses and sends no data to external
services.

The bridge daemon owns the active pairing PIN, pending requests, and responses
in memory. The PIN is intentionally not written to disk. Codex may restart or
recycle the stdio MCP helper, but the pairing window depends on the bridge
daemon staying alive.

The state file contains only the Thunderbird bearer token. Extension ID,
last-seen timestamp, legacy Codex-side scopes, active pairing PINs, and request
queues are runtime state and are intentionally not persisted.

## Codex MCP tools

Tool surface:

- `start_pairing`
- `get_status`
- `revoke_pairing`
- `get_capabilities`
- `list_accounts`
- `list_folders`
- `create_folder`
- `rename_folder`
- `delete_folder`
- `search_messages`
- `list_messages`
- `read_message`
- `update_message_flags`
- `move_messages`
- `copy_messages`
- `archive_messages`
- `delete_messages`
- tag, attachment, and rule commands
- `list_attachments`
- `get_attachment`
- `add_inbox`
- `remove_inbox`

`add_inbox` and `remove_inbox` are legacy Codex-side scope notes. The enforced
security boundary is Thunderbird's popup-level `Manage allowed accounts` policy.
When selected-account access is enabled, blocked accounts remain visible in
`list_accounts` with email-like details redacted, and account-specific commands
fail before returning mailbox content.
