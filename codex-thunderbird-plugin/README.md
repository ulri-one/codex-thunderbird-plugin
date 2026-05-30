# Codex Thunderbird Plugin

This prototype exposes Thunderbird mail to Codex through MCP tools and a
loopback-only bridge used by the paired Thunderbird extension.

## Run locally

```powershell
cd codex-thunderbird-plugin
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
