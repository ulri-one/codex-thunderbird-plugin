# Codex Thunderbird Plugin Commands

## Pairing and Status

- `start_pairing` - create a short-lived local PIN and bridge URL.
- `get_status` - show bridge URL, pairing state, extension ID, last-seen time,
  and Codex-side visible scopes.
- `revoke_pairing` - revoke the local token and clear pending requests.
- `get_capabilities` - list command categories and command names.

## Accounts

- `list_accounts` - list Thunderbird accounts with names, types, folders, and
  identity email addresses where Thunderbird exposes them.
- `add_inbox` - add a Codex-side account or folder scope string.
- `remove_inbox` - remove a Codex-side account or folder scope string.

## Folders

- `list_folders` - list account folders.
- `create_folder` - create a folder below a parent folder.
- `rename_folder` - rename a folder.
- `delete_folder` - delete a folder.

Folder creation, rename, and deletion depend on the Thunderbird version and
account type. IMAP servers may also reject some operations.

## Email Search and Reading

- `search_messages` - search messages with Thunderbird query fields.
- `list_messages` - list message summaries in a folder.
- `read_message` - read one message header and optionally its full MIME tree.

Search examples:

```json
{ "query": { "subject": "invoice" }, "limit": 25 }
```

```json
{ "query": { "from": "alice@example.com", "read": false }, "limit": 50 }
```

## Email Actions

- `update_message_flags` - update `read`, `flagged`, `junk`, or `new`.
- `move_messages` - move messages to a destination folder.
- `copy_messages` - copy messages to a destination folder.
- `archive_messages` - archive messages using Thunderbird's archive settings.
- `delete_messages` - delete messages, optionally permanently.

Thunderbird exposes starred/flagged state and tags. Custom message-list icons are
not a normal MailExtension feature, so the bridge does not implement arbitrary
icons.

## Tags and Labels

- `list_tags` - list Thunderbird tags.
- `create_tag` - create a tag with a key, display name, and color.
- `update_tag` - rename or recolor a tag.
- `delete_tag` - delete a tag definition.
- `set_message_tags` - replace the tag list on a message.

These commands map to Thunderbird tags. Gmail labels and Outlook categories are
conceptually similar, but provider-specific server-side labels are not modified
directly; Thunderbird remains the source of truth.

## Attachments

- `list_attachments` - list attachment metadata.
- `get_attachment` - return one attachment as base64, capped by `maxBytes`.
- `get_attachment_chunk` - read a slice of a large attachment as base64.
- `save_attachment` - save an attachment through Thunderbird's downloads API.

Large attachments should usually use `get_attachment_chunk` or
`save_attachment`, because MCP responses can become too large to be practical.

## Sorting Rules

- `list_rules` - list extension-local sorting rules.
- `create_rule` - create a sorting rule.
- `update_rule` - update a sorting rule.
- `delete_rule` - delete a sorting rule.
- `run_rule` - manually run a rule against matching messages.

Rules are stored in extension local storage and run only when Codex asks for
`run_rule`. They do not edit Thunderbird's native message filter files. A rule
has this shape:

```json
{
  "name": "Invoices to Finance",
  "enabled": true,
  "query": { "subject": "invoice" },
  "actions": [
    { "type": "tag", "tags": ["finance"] },
    { "type": "move", "destinationFolderId": "folder-id" }
  ]
}
```

Supported rule actions:

- `move`
- `copy`
- `delete`
- `archive`
- `markRead`
- `flag`
- `tag`

## Provider API Comparison

Gmail and Microsoft Graph expose HTTP APIs for many of the same ideas: messages,
threads, labels/categories, attachments, search queries, and filters/rules. The
bridge implements the portable subset through Thunderbird instead of talking to
providers directly.

Direct provider APIs can offer extra features such as Gmail server-side filters
or Outlook inbox rules, but they require OAuth/app registration, provider
permissions, refresh-token storage, and provider-specific behavior. This project
keeps credentials in Thunderbird and uses local-only communication.
