$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$extensionDir = Join-Path $repoRoot "thunderbird-extension"
$releaseDir = Join-Path $repoRoot "release"
$manifestPath = Join-Path $extensionDir "manifest.json"
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$baseName = "codex-thunderbird-plugin"
$zipPath = Join-Path $releaseDir "$baseName.xpi"
$plainZipPath = Join-Path $releaseDir "$baseName.zip"
$versionedZipPath = Join-Path $releaseDir "$baseName-v$($manifest.version).xpi"
$versionedPlainZipPath = Join-Path $releaseDir "$baseName-v$($manifest.version).zip"
$installNotesPath = Join-Path $releaseDir "CODEX-INSTALLATION.md"

if (!(Test-Path $extensionDir)) {
  throw "Extension directory not found: $extensionDir"
}

New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null
function Remove-IfExists($path) {
  if (Test-Path $path) {
    try {
      Remove-Item -LiteralPath $path -Force
    } catch {
      Write-Warning "Could not replace locked release file: $path"
    }
  }
}

Remove-IfExists $zipPath
Remove-IfExists $plainZipPath
Remove-IfExists $versionedZipPath
Remove-IfExists $versionedPlainZipPath

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$extensionRoot = (Resolve-Path -LiteralPath $extensionDir).Path.TrimEnd("\") + "\"
$zip = [System.IO.Compression.ZipFile]::Open($plainZipPath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  Get-ChildItem -LiteralPath $extensionDir -Recurse -File | ForEach-Object {
    $relativePath = $_.FullName.Substring($extensionRoot.Length).Replace("\", "/")
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
      $zip,
      $_.FullName,
      $relativePath,
      [System.IO.Compression.CompressionLevel]::Optimal
    ) | Out-Null
  }
} finally {
  $zip.Dispose()
}
Copy-Item -LiteralPath $plainZipPath -Destination $zipPath
if (!(Test-Path $versionedPlainZipPath)) {
  Copy-Item -LiteralPath $plainZipPath -Destination $versionedPlainZipPath
}
if (!(Test-Path $versionedZipPath)) {
  Copy-Item -LiteralPath $plainZipPath -Destination $versionedZipPath
}
$installNotes = @'
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
2. Install and enable `Codex Thunderbird` in Codex.
3. Install `codex-thunderbird-plugin.xpi` in Thunderbird.
4. In Codex, type `@Codex Thunderbird` and invoke the command `start_pairing`.
5. Enter the returned bridge URL and PIN in the Thunderbird add-on popup.
6. Use `Manage allowed accounts` in Thunderbird to choose all accounts or only
   selected accounts.
'@
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($installNotesPath, $installNotes + [Environment]::NewLine, $utf8NoBom)
Write-Output "Packaged Thunderbird extension at $zipPath"
Write-Output "Packaged Thunderbird extension zip at $plainZipPath"
Write-Output "Packaged versioned Thunderbird extension at $versionedZipPath"
Write-Output "Packaged versioned Thunderbird extension zip at $versionedPlainZipPath"
Write-Output "Wrote Codex installation notes at $installNotesPath"
