# Publishing

## Thunderbird Add-on

The extension is packaged as:

- `dist/codex-thunderbird-plugin.zip`
- `dist/codex-thunderbird-plugin.xpi`

The `.xpi` file is a ZIP archive with the Thunderbird extension files. For
public distribution, submit the `.zip` or `.xpi` through Thunderbird's add-on
signing flow on addons.thunderbird.net. Keep the `browser_specific_settings`
extension ID stable across releases.

Before submission:

- Confirm the popup pairing flow in a clean Thunderbird profile.
- Confirm account listing with at least one IMAP account and Local Folders.
- Confirm move/copy/delete on test messages only.
- Confirm large attachment chunking on a non-sensitive test attachment.
- Review the requested permissions in `manifest.json`.

## Codex Plugin From GitHub

This repository is ready to push to GitHub:

- Codex plugin manifest: `codex-thunderbird-plugin/.codex-plugin/plugin.json`
- MCP server config: `codex-thunderbird-plugin/.mcp.json`
- Repo marketplace: `.agents/plugins/marketplace.json`
- Shared icon assets in the plugin package

After pushing, install with:

```powershell
npx codex-marketplace add OWNER/REPO/codex-thunderbird-plugin --plugin
```

If your Codex version supports adding remote plugin marketplaces directly, you
can alternatively add the repository marketplace and then install
`codex-thunderbird@codex-thunderbird-plugin`.

## Versioning

Use matching version numbers for:

- `codex-thunderbird-plugin/.codex-plugin/plugin.json`
- `codex-thunderbird-plugin/package.json`
- `thunderbird-extension/manifest.json`

The Codex Thunderbird Plugin and Thunderbird extension are currently `0.3.0`.
