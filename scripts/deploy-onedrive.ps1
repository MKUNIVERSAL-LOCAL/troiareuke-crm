param(
  [Parameter(Mandatory = $true)]
  [string]$Target
)

$ErrorActionPreference = 'Stop'

$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$source = [IO.Path]::GetFullPath((Join-Path $repoRoot 'release\win-unpacked'))
$targetPath = [IO.Path]::GetFullPath($Target)
$package = Get-Content -LiteralPath (Join-Path $repoRoot 'package.json') -Encoding utf8 -Raw | ConvertFrom-Json
$exeName = "$($package.productName).exe"

if (-not $targetPath.StartsWith('F:\OneDrive\', [StringComparison]::OrdinalIgnoreCase)) {
  throw "Safety check failed: target must be inside F:\OneDrive. $targetPath"
}
if (-not (Test-Path -LiteralPath $source -PathType Container)) {
  throw 'Build output is missing. Run npm run electron:build:dir first.'
}
if (-not (Test-Path -LiteralPath (Join-Path $source $exeName) -PathType Leaf)) {
  throw 'Built executable is missing.'
}
if (-not (Test-Path -LiteralPath (Join-Path $source 'resources\app.asar') -PathType Leaf)) {
  throw 'Built app.asar is missing.'
}
if (-not (Test-Path -LiteralPath $targetPath -PathType Container)) {
  throw 'The established OneDrive deployment folder is missing.'
}

$targetExe = Join-Path $targetPath $exeName
$running = Get-CimInstance Win32_Process | Where-Object {
  $_.ExecutablePath -and ([IO.Path]::GetFullPath($_.ExecutablePath) -eq $targetExe)
}
if ($running) {
  throw 'The OneDrive CRM app is running. Close it before deployment.'
}

# Never use /MIR: extra customer data and project folders must be preserved.
# /MT:1 limits disk and OneDrive load.
& robocopy.exe $source $targetPath /E /R:2 /W:1 /MT:1 /NFL /NDL /NP /NJH /NJS
$robocopyExitCode = $LASTEXITCODE
if ($robocopyExitCode -ge 8) {
  throw "OneDrive copy failed. robocopy exit code: $robocopyExitCode"
}

$commit = (& git -C $repoRoot rev-parse --short HEAD 2>$null)
$deployedAt = Get-Date -Format 'yyyy-MM-dd HH:mm:ss K'
$metadata = @(
  "version=$($package.version)"
  "commit=$commit"
  "deployedAt=$deployedAt"
  "source=$repoRoot"
) -join [Environment]::NewLine
Set-Content -LiteralPath (Join-Path $targetPath '_deployment-version.txt') -Value $metadata -Encoding utf8

Write-Host "OneDrive deployment complete: v$($package.version)"
Write-Host $targetPath
