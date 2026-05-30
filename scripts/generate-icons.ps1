$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$repoRoot = Split-Path -Parent $PSScriptRoot
$sizes = @(16, 32, 48, 64, 128)
$targets = @(
  (Join-Path $repoRoot "thunderbird-extension\icons"),
  (Join-Path $repoRoot "codex-thunderbird-plugin\assets")
)

foreach ($target in $targets) {
  New-Item -ItemType Directory -Force -Path $target | Out-Null
}

function New-BridgeIcon($size, $path) {
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
  $graphics.FillRectangle($paper, $mail)

  $penBlue = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(40,73,199)), (7*$scale)
  $penBlue.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $penBlue.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $penBlue.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $graphics.DrawLines($penBlue, @(
    (New-Object System.Drawing.PointF (30*$scale), (49*$scale)),
    (New-Object System.Drawing.PointF (64*$scale), (75*$scale)),
    (New-Object System.Drawing.PointF (98*$scale), (49*$scale))
  ))

  $penLight = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(94,234,212)), (5*$scale)
  $penLight.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $penLight.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $graphics.DrawLine($penLight, (30*$scale), (91*$scale), (55*$scale), (68*$scale))
  $graphics.DrawLine($penLight, (98*$scale), (91*$scale), (73*$scale), (68*$scale))

  $white = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
  $graphics.FillEllipse($white, (80*$scale), (20*$scale), (22*$scale), (22*$scale))
  $spark = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(49,85,212)), (4*$scale)
  $spark.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $spark.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $graphics.DrawLine($spark, (91*$scale), (24*$scale), (91*$scale), (38*$scale))
  $graphics.DrawLine($spark, (84*$scale), (31*$scale), (98*$scale), (31*$scale))

  $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose()
  $bitmap.Dispose()
}

foreach ($size in $sizes) {
  foreach ($target in $targets) {
    New-BridgeIcon $size (Join-Path $target "icon-$size.png")
  }
}

Write-Output "Generated bridge icons."
