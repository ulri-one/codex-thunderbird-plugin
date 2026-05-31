$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$repoRoot = Split-Path -Parent $PSScriptRoot
$sizes = @(16, 32, 48, 64, 128)
$targets = @(
  (Join-Path $repoRoot "thunderbird-extension\icons"),
  (Join-Path $repoRoot "codex-plugin\assets")
)

foreach ($target in $targets) {
  New-Item -ItemType Directory -Force -Path $target | Out-Null
}

function New-BridgeIcon($size, $outputPath) {
  $bitmap = New-Object System.Drawing.Bitmap $size, $size
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear([System.Drawing.Color]::Transparent)

  $scale = $size / 128.0
  $rect = New-Object System.Drawing.RectangleF 0, 0, $size, $size
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, ([System.Drawing.Color]::FromArgb(45,212,191)), ([System.Drawing.Color]::FromArgb(39,52,111)), 45
  $radius = 28 * $scale
  $pathBg = New-Object System.Drawing.Drawing2D.GraphicsPath
  $diameter = $radius * 2
  $pathBg.AddArc(0, 0, $diameter, $diameter, 180, 90)
  $pathBg.AddArc($size - $diameter, 0, $diameter, $diameter, 270, 90)
  $pathBg.AddArc($size - $diameter, $size - $diameter, $diameter, $diameter, 0, 90)
  $pathBg.AddArc(0, $size - $diameter, $diameter, $diameter, 90, 90)
  $pathBg.CloseFigure()
  $graphics.FillPath($brush, $pathBg)

  $mail = New-Object System.Drawing.RectangleF (26*$scale), (42*$scale), (76*$scale), (54*$scale)
  $paper = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(246,255,253))
  $mailRadius = 11 * $scale
  $mailPath = New-Object System.Drawing.Drawing2D.GraphicsPath
  $mailDiameter = $mailRadius * 2
  $mailPath.AddArc($mail.X, $mail.Y, $mailDiameter, $mailDiameter, 180, 90)
  $mailPath.AddArc($mail.Right - $mailDiameter, $mail.Y, $mailDiameter, $mailDiameter, 270, 90)
  $mailPath.AddArc($mail.Right - $mailDiameter, $mail.Bottom - $mailDiameter, $mailDiameter, $mailDiameter, 0, 90)
  $mailPath.AddArc($mail.X, $mail.Bottom - $mailDiameter, $mailDiameter, $mailDiameter, 90, 90)
  $mailPath.CloseFigure()
  $graphics.FillPath($paper, $mailPath)

  $penBlue = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(40,73,199)), (7*$scale)
  $penBlue.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $penBlue.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $penBlue.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $graphics.DrawLines($penBlue, @(
    (New-Object System.Drawing.PointF (32*$scale), (49*$scale)),
    (New-Object System.Drawing.PointF (64*$scale), (74*$scale)),
    (New-Object System.Drawing.PointF (96*$scale), (49*$scale))
  ))

  $penLight = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(94,234,212)), (6*$scale)
  $penLight.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $penLight.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $penLight.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $graphics.DrawLine($penLight, (32*$scale), (89*$scale), (57*$scale), (67*$scale))
  $graphics.DrawLine($penLight, (96*$scale), (89*$scale), (71*$scale), (67*$scale))

  $outline = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(140,255,255,255)), (3*$scale)
  $graphics.DrawPath($outline, $mailPath)

  $outline.Dispose()
  $mailPath.Dispose()
  $penLight.Dispose()
  $penBlue.Dispose()
  $paper.Dispose()
  $brush.Dispose()
  $pathBg.Dispose()
  $graphics.Dispose()

  $tempPath = "$outputPath.tmp.png"
  if (Test-Path $tempPath) {
    Remove-Item -LiteralPath $tempPath -Force
  }
  $bitmap.Save($tempPath, [System.Drawing.Imaging.ImageFormat]::Png)
  Move-Item -LiteralPath $tempPath -Destination $outputPath -Force
  $bitmap.Dispose()
}

foreach ($size in $sizes) {
  foreach ($target in $targets) {
    New-BridgeIcon $size (Join-Path $target "icon-$size.png")
  }
}

Write-Output "Generated bridge icons."
