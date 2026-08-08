$ErrorActionPreference = 'Stop'

$manifest = Join-Path $PSScriptRoot '..\native\tomatodo_importer\Cargo.toml'
cargo build --release --manifest-path $manifest

$binary = Join-Path $PSScriptRoot '..\native\tomatodo_importer\target\release\zhixu_tomatodo_importer.exe'
if (-not (Test-Path -LiteralPath $binary)) {
  throw '番茄 TODO 解析器构建完成后未找到输出文件。'
}

Get-Item -LiteralPath $binary | Select-Object FullName, Length, LastWriteTime
