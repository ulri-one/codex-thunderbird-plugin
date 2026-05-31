# Contributing

Contributions are highly welcomed.

This project is an early pre-release bridge between Codex and Thunderbird, so
there is plenty of room for help: testing on different Thunderbird versions,
improving setup documentation, tightening security review, expanding command
coverage, fixing account-provider quirks, and polishing packaging.

Before opening a pull request, please:

- Keep the local-first security model intact.
- Avoid adding direct mail-provider credential handling.
- Document any new permission requested by the Thunderbird add-on.
- Keep generated release files reproducible through the scripts in `scripts/`.
- Prefer small, focused changes with a clear explanation.

Bug reports and setup notes are also useful, especially if they include the
Thunderbird version, Codex Desktop version, operating system, and whether the
failure happened during marketplace install, pairing, or a specific command.
