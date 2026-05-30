$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$extensionDir = Join-Path $repoRoot "thunderbird-extension"
$distDir = Join-Path $repoRoot "dist"
$zipPath = Join-Path $distDir "codex-thunderbird-plugin.xpi"
$plainZipPath = Join-Path $distDir "codex-thunderbird-plugin.zip"

if (!(Test-Path $extensionDir)) {
  throw "Extension directory not found: $extensionDir"
}

New-Item -ItemType Directory -Force -Path $distDir | Out-Null
if (Test-Path $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}
if (Test-Path $plainZipPath) {
  Remove-Item -LiteralPath $plainZipPath -Force
}

Compress-Archive -Path (Join-Path $extensionDir "*") -DestinationPath $plainZipPath
Copy-Item -LiteralPath $plainZipPath -Destination $zipPath
Write-Output "Packaged Thunderbird extension at $zipPath"
Write-Output "Packaged Thunderbird extension zip at $plainZipPath"
