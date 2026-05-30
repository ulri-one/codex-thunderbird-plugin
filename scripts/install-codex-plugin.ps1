$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$source = Join-Path $repoRoot "codex-thunderbird-plugin"
$pluginRoot = Join-Path $HOME "plugins"
$target = Join-Path $pluginRoot "codex-thunderbird"
$marketplaceDir = Join-Path $HOME ".agents\plugins"
$marketplacePath = Join-Path $marketplaceDir "marketplace.json"

if (!(Test-Path $source)) {
  throw "Source plugin not found: $source"
}

New-Item -ItemType Directory -Force -Path $pluginRoot, $marketplaceDir | Out-Null

if (Test-Path $target) {
  robocopy $source $target /MIR /XD .codex-thunderbird-state node_modules /NFL /NDL /NJH /NJS /NP | Out-Null
} else {
  robocopy $source $target /E /XD .codex-thunderbird-state node_modules /NFL /NDL /NJH /NJS /NP | Out-Null
}
if ($LASTEXITCODE -gt 7) {
  throw "robocopy failed with exit code $LASTEXITCODE"
}

if (Test-Path $marketplacePath) {
  $marketplace = Get-Content $marketplacePath -Raw | ConvertFrom-Json
} else {
  $marketplace = [pscustomobject]@{
    name = "personal"
    interface = [pscustomobject]@{ displayName = "Personal" }
    plugins = @()
  }
}

$existing = @($marketplace.plugins | Where-Object { $_.name -eq "codex-thunderbird" })
$entry = [pscustomobject]@{
  name = "codex-thunderbird"
  source = [pscustomobject]@{
    source = "local"
    path = "./plugins/codex-thunderbird"
  }
  policy = [pscustomobject]@{
    installation = "AVAILABLE"
    authentication = "ON_INSTALL"
  }
  category = "Productivity"
}

if ($existing.Count -eq 0) {
  $marketplace.plugins = @($marketplace.plugins) + $entry
} else {
  $marketplace.plugins = @($marketplace.plugins | ForEach-Object {
    if ($_.name -eq "codex-thunderbird") { $entry } else { $_ }
  })
}

$json = $marketplace | ConvertTo-Json -Depth 20
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($marketplacePath, $json + [Environment]::NewLine, $utf8NoBom)

Write-Output "Installed Codex Thunderbird Plugin to $target"
Write-Output "Updated marketplace at $marketplacePath"
Write-Output "Restart Codex, then pair from Thunderbird."
