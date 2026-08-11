param(
  [string]$Executable,
  [string]$LegacyDatabasePath
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
if (-not $Executable) {
  $Executable = Get-ChildItem -LiteralPath (Join-Path $repoRoot 'release\windows\win-unpacked') -Filter '*.exe' |
    Select-Object -First 1 -ExpandProperty FullName
}
if (-not $Executable -or -not (Test-Path -LiteralPath $Executable)) {
  throw 'Packaged Zhixu executable was not found.'
}

function Get-SharedFileHash([string]$Path) {
  $stream = [IO.File]::Open($Path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
  try {
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return [Convert]::ToHexString($sha.ComputeHash($stream)) }
    finally { $sha.Dispose() }
  }
  finally { $stream.Dispose() }
}

function Copy-SharedFile([string]$Source, [string]$Destination) {
  $input = [IO.File]::Open($Source, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
  try {
    $output = [IO.File]::Open($Destination, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try {
      $input.CopyTo($output)
      $output.Flush($true)
    }
    finally { $output.Dispose() }
  }
  finally { $input.Dispose() }
}

$testRoot = Join-Path $env:TEMP ("zhixu-self-test-$([guid]::NewGuid().ToString('N'))")
$roaming = Join-Path $testRoot 'Roaming'
$local = Join-Path $testRoot 'Local'
$stdout = Join-Path $testRoot 'stdout.log'
$stderr = Join-Path $testRoot 'stderr.log'
New-Item -ItemType Directory -Force -Path $roaming, $local | Out-Null

$originalAppData = $env:APPDATA
$originalLocalAppData = $env:LOCALAPPDATA
try {
  $sourceHash = $null
  if ($LegacyDatabasePath) {
    $fixture = Join-Path $roaming 'GalaxyWK\Zhixu\Zhixu\zhixu.sqlite'
    New-Item -ItemType Directory -Force -Path (Split-Path $fixture) | Out-Null
    $sourceHash = Get-SharedFileHash $LegacyDatabasePath
    Copy-SharedFile $LegacyDatabasePath $fixture
    if ((Get-SharedFileHash $fixture) -ne $sourceHash -or
        (Get-SharedFileHash $LegacyDatabasePath) -ne $sourceHash) {
      throw 'Legacy database changed while the read-only fixture was created.'
    }
  }

  $env:APPDATA = $roaming
  $env:LOCALAPPDATA = $local
  $process = Start-Process -FilePath $Executable -ArgumentList '--self-test' -WindowStyle Hidden -Wait -PassThru `
    -RedirectStandardOutput $stdout -RedirectStandardError $stderr
  $output = Get-Content -LiteralPath $stdout | Where-Object { $_.Trim() } | Select-Object -Last 1
  if ($process.ExitCode -ne 0) {
    throw "Packaged self-test exited with $($process.ExitCode): $(Get-Content -Raw -LiteralPath $stderr)"
  }
  $result = $output | ConvertFrom-Json
  if ($result.schemaVersion -ne 10 -or $result.integrity -ne 'ok') {
    throw "Packaged self-test failed: $output"
  }
  if ($LegacyDatabasePath -and
      ($result.migration.status -ne 'migrated' -or $result.migration.sourceHash -ne $sourceHash.ToLowerInvariant())) {
    throw "Legacy migration self-test failed: $output"
  }
  Write-Output $output
}
finally {
  $env:APPDATA = $originalAppData
  $env:LOCALAPPDATA = $originalLocalAppData
  $resolvedTemp = [IO.Path]::GetFullPath($env:TEMP).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
  $resolvedTest = [IO.Path]::GetFullPath($testRoot)
  if ($resolvedTest.StartsWith($resolvedTemp, [StringComparison]::OrdinalIgnoreCase) -and
      (Split-Path $resolvedTest -Leaf).StartsWith('zhixu-self-test-')) {
    Remove-Item -LiteralPath $resolvedTest -Recurse -Force -ErrorAction SilentlyContinue
  }
}
