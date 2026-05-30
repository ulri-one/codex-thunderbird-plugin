# Codex Thunderbird Plugin Extension

This MailExtension pairs Thunderbird with the local Codex Thunderbird Plugin.

## Development install

1. Open Thunderbird.
2. Open Add-ons and Themes.
3. Use the debug/add-on development flow to load this folder temporarily.
4. In Codex, call `start_pairing` from the Codex Thunderbird Plugin.
5. Open the extension popup, enter the bridge URL and PIN, and pair.

## Permissions

- `accountsRead` lets the extension list Thunderbird accounts.
- `accountsFolders` lets it inspect account folders.
- `messagesRead` lets it list and read messages and attachments.
- `storage` stores the local bridge URL and token.
- `http://127.0.0.1/*` allows communication with the local Codex bridge.

## Notes

The extension uses Thunderbird as the mail access layer. It does not store mail
provider credentials and does not expose a remote network service.

## Packaging

Run this from the repository root:

```powershell
.\scripts\package-thunderbird-extension.ps1
```

The packaged archives are written to `dist/`.
