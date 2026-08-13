param(
  [string]$OutputPath = (Join-Path $PSScriptRoot '..\docs\assets\social-preview.png')
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$iconPath = Join-Path $root 'shared\branding\zhixu-mark-1024.png'
$fontPath = Join-Path $root 'apps\windows\resources\fonts\NotoSansSC-Variable.ttf'
$resolvedOutput = [IO.Path]::GetFullPath($OutputPath)
$outputDirectory = Split-Path -Parent $resolvedOutput
[IO.Directory]::CreateDirectory($outputDirectory) | Out-Null

$bitmap = [Drawing.Bitmap]::new(1280, 640, [Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [Drawing.Graphics]::FromImage($bitmap)
$icon = [Drawing.Image]::FromFile($iconPath)
$fonts = [Drawing.Text.PrivateFontCollection]::new()
$fonts.AddFontFile($fontPath)
$titleText = ConvertFrom-Json '"\u77e5\u5e8f Zhixu"'
$subtitleText = ConvertFrom-Json '"Windows \u672c\u5730\u4f18\u5148\u4e2a\u4eba\u5de5\u4f5c\u53f0"'
$detailText = ConvertFrom-Json '"\u4efb\u52a1 \u00b7 \u4e13\u6ce8 \u00b7 \u6d88\u8d39\u5206\u6790 \u00b7 \u53ef\u9009\u4e91\u540c\u6b65"'

try {
  $graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.TextRenderingHint = [Drawing.Text.TextRenderingHint]::AntiAliasGridFit

  $background = [Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml('#F7F9FC'))
  $surface = [Drawing.SolidBrush]::new([Drawing.Color]::White)
  $border = [Drawing.Pen]::new([Drawing.ColorTranslator]::FromHtml('#D7E0EF'), 2)
  $titleBrush = [Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml('#14213D'))
  $subtitleBrush = [Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml('#42526E'))
  $detailBrush = [Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml('#64748B'))
  $accent = [Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml('#175CD3'))

  try {
    $graphics.FillRectangle($background, 0, 0, 1280, 640)

    $surfacePath = [Drawing.Drawing2D.GraphicsPath]::new()
    try {
      $radius = 32
      $diameter = $radius * 2
      $surfacePath.AddArc(72, 72, $diameter, $diameter, 180, 90)
      $surfacePath.AddArc(1144, 72, $diameter, $diameter, 270, 90)
      $surfacePath.AddArc(1144, 504, $diameter, $diameter, 0, 90)
      $surfacePath.AddArc(72, 504, $diameter, $diameter, 90, 90)
      $surfacePath.CloseFigure()
      $graphics.FillPath($surface, $surfacePath)
      $graphics.DrawPath($border, $surfacePath)
    } finally {
      $surfacePath.Dispose()
    }

    $graphics.DrawImage($icon, [Drawing.Rectangle]::new(144, 176, 288, 288))

    $family = $fonts.Families[0]
    $titleFont = [Drawing.Font]::new($family, 67, [Drawing.FontStyle]::Bold, [Drawing.GraphicsUnit]::Pixel)
    $subtitleFont = [Drawing.Font]::new($family, 34, [Drawing.FontStyle]::Regular, [Drawing.GraphicsUnit]::Pixel)
    $detailFont = [Drawing.Font]::new($family, 24, [Drawing.FontStyle]::Regular, [Drawing.GraphicsUnit]::Pixel)
    $textFormat = [Drawing.StringFormat]::new([Drawing.StringFormat]::GenericTypographic)

    try {
      $graphics.DrawString($titleText, $titleFont, $titleBrush, 504, 216, $textFormat)
      $graphics.DrawString($subtitleText, $subtitleFont, $subtitleBrush, 508, 324, $textFormat)
      $graphics.FillRectangle($accent, 508, 406, 88, 6)
      $graphics.DrawString($detailText, $detailFont, $detailBrush, 508, 438, $textFormat)
    } finally {
      $titleFont.Dispose()
      $subtitleFont.Dispose()
      $detailFont.Dispose()
      $textFormat.Dispose()
    }
  } finally {
    $background.Dispose()
    $surface.Dispose()
    $border.Dispose()
    $titleBrush.Dispose()
    $subtitleBrush.Dispose()
    $detailBrush.Dispose()
    $accent.Dispose()
  }

  $bitmap.Save($resolvedOutput, [Drawing.Imaging.ImageFormat]::Png)
} finally {
  $fonts.Dispose()
  $icon.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
}

$image = [Drawing.Image]::FromFile($resolvedOutput)
try {
  if ($image.Width -ne 1280 -or $image.Height -ne 640) {
    throw "Unexpected Social Preview dimensions: $($image.Width)x$($image.Height)"
  }
} finally {
  $image.Dispose()
}

Write-Output $resolvedOutput
