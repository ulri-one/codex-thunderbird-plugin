# Security Policy

Codex Thunderbird Plugin is currently a pre-release project. Please treat it as
experimental software and review the local permissions before using it with
sensitive mailboxes.

## Reporting A Vulnerability

Please report security issues by email:

```text
sec@ulri.one
```

Include a clear description of the issue, the affected version or commit, steps
to reproduce, and any relevant logs with private mail content removed.

Please do not publish vulnerability details publicly before the repository owner
has had a reasonable chance to investigate and respond.

## Security Model

- Mail-provider credentials stay in Thunderbird.
- The Codex plugin listens only on loopback (`127.0.0.1`).
- Pairing uses a short-lived PIN and a local token.
- The Thunderbird add-on uses Thunderbird MailExtension APIs rather than reading
  Thunderbird profile files directly.
