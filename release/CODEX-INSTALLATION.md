# Codex Installation

This release folder contains the bundled Thunderbird add-on files for Codex
Thunderbird Plugin.

For the complete installation and pairing process, read the repository
README.md:

```text
../README.md
```

The short version:

1. Add `https://github.com/ulri-one/codex-thunderbird-plugin.git` as a Codex
   plugin marketplace/repository source.
2. Install and enable `Codex Thunderbird Plugin` in Codex.
3. Install `codex-thunderbird-plugin.xpi` in Thunderbird.
4. In Codex, run `@Codex Thunderbird Plugin start_pairing`.
5. Approve localhost access when Codex asks for elevated permission.
6. Enter the returned bridge URL and PIN in the Thunderbird add-on popup.
