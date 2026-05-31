# Codex Thunderbird Plugin

Codex Thunderbird Plugin connects your local Thunderbird installation to Codex.
It lets Codex work with the mail accounts already configured in Thunderbird
without asking for IMAP, SMTP, OAuth, or mail-provider passwords.

Publisher: ULRI, https://ulri.one

The project is intentionally local-first. Codex runs a local MCP plugin and a
loopback-only bridge on your machine. Thunderbird runs a MailExtension add-on
that calls Thunderbird's supported mail APIs. The two sides pair with a short
PIN, then exchange requests only over `127.0.0.1`.

This is the first public major release. It is useful for testing and early adopters, but the interface, packaging, and permission model may still change.

## What It Provides

- List Thunderbird accounts and folders.
- Search, list, and read messages through Thunderbird.
- Read message attachments, including chunked reads for larger files.
- Move, copy, archive, delete, flag, and tag messages where Thunderbird and the
  account type allow it.
- Create and run extension-local sorting rules on demand.
- Allow Codex to access all Thunderbird accounts or only selected accounts,
  enforced inside the Thunderbird add-on.
- Keep mail credentials inside Thunderbird.

## Repository Layout

- `thunderbird-extension/` - Thunderbird MailExtension add-on. It displays the
  pairing popup, stores the local bridge token, and performs account, folder,
  message, tag, rule, and attachment operations through Thunderbird APIs.
- `codex-plugin/` - Codex plugin and MCP server. It exposes Codex
  tools, starts the local bridge at `http://127.0.0.1:17654`, and queues
  requests for the paired Thunderbird add-on.
- `assets/` - Source artwork for the shared plugin/add-on icon.
- `scripts/` - Helper scripts for icon generation, local Codex plugin install,
  and Thunderbird release packaging.
- `docs/` - Architecture, command reference, privacy/security notes, publishing
  notes, and development context.
- `release/` - Generated Thunderbird add-on bundles and release-facing install
  notes. This folder is created by the packaging script.

## Requirements

- Thunderbird 102 or newer.
- Codex Desktop with plugin marketplace support.
- Node.js 18 or newer available on `PATH`.
- PowerShell on Windows for the included helper scripts.

## Install In Codex From The Repository

The public repository URL is:

```text
https://github.com/ulri-one/codex-thunderbird-plugin.git
```

Add this repository as a Codex plugin marketplace source, then install and
activate `Codex Thunderbird Plugin` from that marketplace. The exact UI labels
may vary by Codex Desktop version, but the flow is:

1. Open Codex Desktop settings.
2. Go to plugin or marketplace settings.
3. Add a marketplace/repository source with the URL above.
4. Refresh the marketplace.
5. Install and enable `Codex Thunderbird Plugin`.
6. Restart Codex if it asks you to reload plugins.

For local development, you can also install the plugin from a clone:

```powershell
.\scripts\install-codex-plugin.ps1
```

That copies `codex-plugin/` into your local Codex plugin directory
and adds a personal marketplace entry.

## Install The Thunderbird Add-on

Use the packaged `.xpi` from `release/` when available:

1. Open Thunderbird.
2. Open `Add-ons and Themes`.
3. Use the gear menu and choose `Install Add-on From File...`.
4. Select `release/codex-thunderbird-plugin.xpi`.
5. Confirm the requested permissions.
6. Pin or open the add-on button if Thunderbird does not show it immediately.

For development, load the unpacked add-on temporarily from
`thunderbird-extension/` through Thunderbird's debugging add-on workflow.

## Pair Thunderbird With Codex

Pairing is required before Codex can read anything from Thunderbird.

1. In Codex, mention the plugin and run:

   ```text
   @Codex Thunderbird Plugin start_pairing
   ```

2. Codex returns a bridge URL and a short-lived PIN. The local bridge starts
   lazily on `127.0.0.1:17654` when pairing begins.
3. In Thunderbird, click the `Codex Thunderbird Plugin` add-on button.
4. Enter the bridge URL and PIN.
5. Click Pair.
6. Open `Manage allowed accounts` in the Thunderbird popup and choose either
   `All accounts access` or selected accounts only.

After pairing, you can ask Codex things like:

```text
@Codex Thunderbird Plugin List my Thunderbird folders.
@Codex Thunderbird Plugin Summarize recent messages in my inbox.
@Codex Thunderbird Plugin Find invoices from May in my work account.
```

## Build Release Files

Regenerate icons:

```powershell
.\scripts\generate-icons.ps1
```

Bundle the Thunderbird add-on:

```powershell
.\scripts\package-thunderbird-extension.ps1
```

The script writes:

- `release/codex-thunderbird-plugin.xpi`
- `release/codex-thunderbird-plugin.zip`
- versioned copies such as `release/codex-thunderbird-plugin-v1.0.0.xpi`
- `release/CODEX-INSTALLATION.md`

## Privacy And Security

The plugin does not ask for mail provider credentials. Thunderbird remains the
mail access layer. The Codex plugin exposes only a loopback bridge on
`127.0.0.1`, and the Thunderbird add-on must pair with a short-lived PIN before
it can respond to requests.

Review [SECURITY.md](SECURITY.md) before using this with sensitive mailboxes.

## More Documentation

- [Command reference](docs/commands.md)
- [Architecture](docs/architecture.md)
- [Privacy and security notes](docs/privacy-security.md)
- [Publishing notes](docs/publishing.md)
- [Contributing](CONTRIBUTING.md)
