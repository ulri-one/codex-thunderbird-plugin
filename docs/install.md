# Installation

## Thunderbird development install

Use this while the extension is unsigned and under active development.

1. Open Thunderbird.
2. Open Add-ons and Themes.
3. Open the add-on tools menu and choose the debugging option.
4. Choose Load Temporary Add-on.
5. Select `thunderbird-extension/manifest.json`.
6. Confirm that the Codex Thunderbird Plugin button appears in Thunderbird.

Temporary add-ons are removed when Thunderbird restarts. For everyday use, the
extension should be packaged and signed, or reloaded after each restart during
development.

## Codex direct MCP install

This is the quickest development path because it does not require publishing a
plugin marketplace.

Add an MCP server entry to the Codex config file:

```toml
[mcp_servers.codex-thunderbird]
command = "node"
args = ["C:\\path\\to\\codex-thunderbird-plugin\\src\\server.js"]
cwd = "C:\\path\\to\\codex-thunderbird-plugin"
```

Then restart Codex. The server should expose tools such as `start_pairing`,
`list_accounts`, `list_folders`, `list_messages`, `read_message`, and
`get_attachment`.

## Codex personal plugin install

For a plugin-style install, copy `codex-thunderbird-plugin` to the personal
plugin location and add it to the personal marketplace.

Run:

```powershell
.\scripts\install-codex-plugin.ps1
```

Then restart Codex and open the plugin page for `codex-thunderbird`.

## Codex install from GitHub

Codex plugins can be prepared for GitHub installation by keeping a valid
`.codex-plugin/plugin.json` in the plugin folder and a repository marketplace at
`.agents/plugins/marketplace.json`. This repository now includes both.

After pushing this repository to GitHub, use one of these flows:

```powershell
npx codex-marketplace add OWNER/REPO/codex-thunderbird-plugin --plugin
```

or add the repository marketplace in Codex if your Codex version supports remote
marketplace sources:

```powershell
codex plugin marketplace add https://github.com/OWNER/REPO
codex plugin add codex-thunderbird@codex-thunderbird-plugin
```

Replace `OWNER/REPO` with the actual GitHub repository. The local personal
install remains the lowest-friction development flow.

## Pairing flow

1. In Codex, call `start_pairing`.
2. Copy the returned bridge URL and six-digit PIN.
3. In Thunderbird, open the Codex Thunderbird Plugin popup.
4. Enter the bridge URL and PIN.
5. Click Pair.
6. In Codex, call `get_status`; it should report `paired: true`.

## First useful calls

1. `list_accounts`
2. `list_folders` with an `accountId`
3. `list_messages` with either a `folderId`, or an `accountId` plus folder
   `path`
4. `read_message` with a `messageId`
5. `list_attachments` with a `messageId`
6. `get_attachment` with `messageId`, `partName`, and optionally `maxBytes`

## Reset

To disconnect Thunderbird from Codex:

1. Call `revoke_pairing` in Codex.
2. Click Disconnect in the Thunderbird popup.

The Codex bridge stores its token in `codex-thunderbird-plugin\.codex-thunderbird-state\state.json`
by default. Set `CODEX_THUNDERBIRD_STATE_DIR` if you want to keep state in a
different local directory.
