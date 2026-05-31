# Privacy and Security

## Local-only communication

The bridge daemon must bind to `127.0.0.1`, not `0.0.0.0`. The MCP helper
starts or reuses the daemon when Codex loads the plugin or when pairing needs
it, and the daemon rejects requests whose remote address is not loopback.

## Pairing

Pairing is initiated from Codex:

1. Codex calls `start_pairing`.
2. The bridge creates a short-lived six-digit PIN.
3. The user opens the Thunderbird extension popup and enters the PIN.
4. The bridge returns a generated API token to the extension.
5. The token is stored in Thunderbird local extension storage.

The six-digit pairing PIN is kept in bridge-daemon memory only. It is not saved
to the Codex plugin state file and is lost if the daemon exits before the
Thunderbird add-on completes pairing.

Recommended production hardening:

- Expire pairing PINs after 2 minutes. The prototype does this.
- Rate-limit failed pairing attempts. The prototype does this.
- Allow only one active pairing session. The prototype does this.
- Rotate the API token on demand by calling `revoke_pairing` and pairing again.
- Show connected extension ID and last-seen time in Codex.
- Add a `revoke_pairing` tool. The prototype does this.
- Store only the durable bearer token under the user's Codex data directory
  with restrictive file permissions. Pairing PINs, extension IDs, last-seen
  timestamps, and request queues should remain in memory only.

## Data minimization

MCP tools should default to metadata-first responses:

- Thunderbird's `Manage allowed accounts` setting can limit Codex to selected
  accounts. Blocked accounts are visible in account listings with email details
  redacted, and account-specific commands are rejected.
- Folder listing returns IDs, names, special-use flags, and counts when
  available.
- Message listing returns headers and snippets, not full bodies.
- Full body and attachments require explicit tool calls.
- Attachment reads should include size limits and content-type filters.

## Attachment handling

Attachments can contain secrets or malware. The bridge should:

- Return metadata before content.
- Enforce a maximum byte size by default. The prototype caps attachment reads at
  5 MiB unless the server default is changed.
- Return base64 only when Codex explicitly asks for content.
- Prefer saving large attachments to a user-approved workspace path.
- Never execute attachments.

## Auditability

Log locally:

- Pairing and token rotation.
- Tool calls by type.
- Attachment export paths.
- Errors.

Do not log message bodies or attachment content by default.
