# Codex Thunderbird

This plugin exposes the Thunderbird mail application to Codex through MCP tools and a loopback-only bridge used by the paired Thunderbird extension.

## Run locally

```powershell
cd codex-plugin
npm run start
```

In Codex plugin form, `.codex-plugin/plugin.json` references `.mcp.json`, which
starts `src/server.js`.

## Pairing

Call the MCP tool `start_pairing`. It returns:

- local bridge URL
- six-digit PIN
- expiry time

Open the Thunderbird extension popup, enter the bridge URL and PIN, and pair.

## Tool behavior

The MCP server does not read mail directly. It queues requests for the
Thunderbird extension, waits for the extension to respond, and returns that
result to Codex.

The MCP process is intentionally small. It lists tools over stdio and starts or
reuses a separate local bridge daemon in `src/bridge-daemon.js`. The daemon owns
the loopback HTTP bridge, active pairing PIN, pending Thunderbird requests,
responses, extension ID, last-seen timestamp, and legacy Codex-side scopes in
memory. The local state file stores only the durable Thunderbird bearer token,
which is required to keep an existing Thunderbird pairing usable after the
bridge daemon restarts.

The MCP process also starts the daemon opportunistically on startup so the
bridge is ready as soon as Codex loads the plugin. If the daemon is already
running, later MCP processes reuse it.

Mailbox access is enforced in Thunderbird. Open the add-on popup and use
`Manage allowed accounts` to choose all accounts or only selected accounts.
Blocked accounts remain visible in `list_accounts`, but email details are
redacted and account-specific commands return a `Manage allowed accounts`
error.

## Command categories

- Pairing: `start_pairing`, `get_status`, `revoke_pairing`, `get_capabilities`
- Accounts: `list_accounts`, `add_inbox`, `remove_inbox`
- Folders: `list_folders`, `create_folder`, `rename_folder`, `delete_folder`
- Email: `search_messages`, `list_messages`, `read_message`,
  `update_message_flags`, `move_messages`, `copy_messages`, `archive_messages`,
  `delete_messages`
- Tags: `list_tags`, `create_tag`, `update_tag`, `delete_tag`,
  `set_message_tags`
- Attachments: `list_attachments`, `get_attachment`, `get_attachment_chunk`,
  `save_attachment`
- Rules: `list_rules`, `create_rule`, `update_rule`, `delete_rule`, `run_rule`

See the repository `docs/commands.md` for detailed usage notes.
