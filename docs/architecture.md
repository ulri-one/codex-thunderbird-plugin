# Architecture

## Summary

Codex cannot safely reach into Thunderbird directly without either a local tool
or a plugin. The proposed solution is a two-part local bridge:

1. The Codex plugin runs an MCP server over stdio.
2. The same process exposes an HTTP bridge bound only to `127.0.0.1`.
3. Thunderbird runs a MailExtension with a small popup UI.
4. The user starts pairing from Codex, enters the one-time PIN in Thunderbird,
   and the extension receives a local API token.
5. When Codex calls an MCP mail tool, the Codex bridge queues a local request.
6. The Thunderbird extension polls for work, executes Thunderbird APIs, and
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

## Codex MCP tools

Initial tool surface:

- `start_pairing`
- `get_status`
- `list_accounts`
- `list_folders`
- `list_messages`
- `read_message`
- `list_attachments`
- `get_attachment`
- `add_inbox`
- `remove_inbox`

The `add_inbox` and `remove_inbox` tools are scoped as Codex-side visibility
controls for Thunderbird accounts/folders. Creating real Thunderbird mail
accounts programmatically is not part of Thunderbird's standard MailExtension
surface and should remain a later native-helper feature if needed.

## Generic IMAP/POP3/SMTP path

A separate MCP server could connect to mail providers directly:

- IMAP for reading folders/messages.
- POP3 for downloading inbox messages.
- SMTP for sending mail.

That path requires storing provider hostnames, usernames, passwords or OAuth
tokens, TLS settings, and per-provider quirks. For Thunderbird users, the
Thunderbird extension route is usually better because Thunderbird already owns
those accounts and credentials.

