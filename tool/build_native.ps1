param(
  [switch]$Release
)

$root = Split-Path -Parent $PSScriptRoot
$native = Join-Path $root 'native\tomatodo_importer'
$profile = if ($Release) { '--release' } else { '' }
Push-Location $native
try {
  if ($Release) { cargo build --release } else { cargo build }
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  $profileDir = if ($Release) { 'release' } else { 'debug' }
  $binaryName = 'zhixu_tomatodo_importer.exe'
  $sourceBinary = Join-Path (Join-Path $native 'target') (Join-Path $profileDir $binaryName)
  $assetDir = Join-Path $root 'assets\native'
  New-Item -ItemType Directory -Force -Path $assetDir | Out-Null
  Copy-Item -LiteralPath $sourceBinary -Destination (Join-Path $assetDir $binaryName) -Force
  Write-Output "Copied native importer to $assetDir"
} finally {
  Pop-Location
}
