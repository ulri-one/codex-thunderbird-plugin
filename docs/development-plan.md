# Development Plan

## Phase 1: Prototype

- Build the Codex MCP server with loopback bridge endpoints.
- Build the Thunderbird extension popup and background bridge loop.
- Support pairing, account listing, folder listing, message listing, message
  body retrieval, attachment listing, and attachment content retrieval.
- Document local installation for both projects.

## Phase 2: Privacy controls

- Add token revocation.
- Add per-account and per-folder allow lists.
- Add read limits for message bodies and attachments.
- Add local audit logs without body or attachment content.

## Phase 3: Usability

- Show pairing and connection status in the Thunderbird popup.
- Add account/folder toggles in Thunderbird.
- Add Codex tools to add or remove visible inbox scopes dynamically.
- Add better error messages for unavailable accounts, unsynced folders, and
  encrypted messages.

## Phase 4: Packaging

- Package the Thunderbird extension as a signed add-on if distribution outside
  developer mode is desired.
- Package the Codex plugin through a personal marketplace entry.
- Add an installer script for local development.

## Phase 5: Optional direct mail connector

- Add a separate generic IMAP/POP3/SMTP MCP connector only if Thunderbird is not
  the desired source of truth.
- Use OAuth where providers support it.
- Encrypt stored credentials with OS keychain integration.

