# Execute from the extracted FIX-PATCH folder:
# powershell -ExecutionPolicy Bypass -File .\APPLY_FIXES_WINDOWS.ps1 -ProjectPath "C:\path\to\Factory-2030"
param([Parameter(Mandatory=$true)][string]$ProjectPath)
$ErrorActionPreference = 'Stop'
$source = $PSScriptRoot
$target = (Resolve-Path $ProjectPath).Path
if (!(Test-Path (Join-Path $target 'frontend/package.json')) -or !(Test-Path (Join-Path $target 'backend/main.py'))) {
  throw "Target is not Factory-2030: $target"
}
$files = @(
'.env.example', '.github/workflows/docker.yml', '.github/workflows/pages.yml',
'backend/Dockerfile', 'backend/tests/test_api.py', 'docker-compose.yml',
'docker-compose.prod.yml', 'frontend/src/main.tsx', 'frontend/src/vite-env.d.ts',
'frontend/vite.config.ts', 'README.md'
)
foreach ($relative in $files) {
  $from = Join-Path $source $relative
  $to = Join-Path $target $relative
  $folder = Split-Path $to -Parent
  New-Item -Path $folder -ItemType Directory -Force | Out-Null
  if (Test-Path $to) {
    $backup = Join-Path (Join-Path $source '_backup_before_fix') $relative
    New-Item -Path (Split-Path $backup -Parent) -ItemType Directory -Force | Out-Null
    Copy-Item $to $backup -Force
  }
  Copy-Item $from $to -Force
  Write-Host "Updated $relative"
}
Write-Host 'Applied fixes. Inspect git diff, commit and push.' -ForegroundColor Green
