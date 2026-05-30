# Codex Thunderbird Plugin

This repository contains the Codex Thunderbird Plugin, a fully local bridge
between the Codex app and Thunderbird.

## Current capability check

In this Codex session there is no exposed Thunderbird, IMAP, POP3, SMTP, or mail
connector tool. A generic mail inbox can still be made available to Codex by
writing a local MCP server, but Codex needs such a server or plugin to exist
first.

SMTP is only for sending mail. Reading inboxes requires IMAP, POP3, local
mailbox files, or Thunderbird's own MailExtension APIs.

## Sub-projects

- `codex-thunderbird-plugin/` - Codex Thunderbird Plugin prototype. It exposes MCP tools and
  a loopback-only HTTP bridge for Thunderbird.
- `thunderbird-extension/` - Codex Thunderbird Plugin MailExtension prototype. It pairs with
  the local bridge and performs Thunderbird account, folder, message, and
  attachment operations.
- `docs/` - Architecture, privacy notes, setup flow, and development plan.
- `scripts/` - Local install/package helpers.

See `docs/install.md` for step-by-step setup in Thunderbird and Codex.
See `docs/commands.md` for the full MCP command reference.
See `docs/publishing.md` for Thunderbird signing and GitHub/Codex publishing notes.

## Recommended architecture

Use Thunderbird as the source of truth for configured accounts and mail access.
The Codex plugin does not read Thunderbird profile files directly and does not
ask for mail provider passwords. Instead, the Thunderbird extension calls
Thunderbird's supported MailExtension APIs and returns results to the local
Codex bridge after explicit pairing.
