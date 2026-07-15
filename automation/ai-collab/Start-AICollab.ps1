[CmdletBinding()]
param(
  [string]$Task,
  [ValidateRange(1, 2)]
  [int]$ReviewRounds = 1,
  [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

function Write-Utf8File {
  param([string]$Path, [string]$Content)
  $parent = Split-Path -Parent $Path
  if ($parent -and -not (Test-Path -LiteralPath $parent)) {
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
  }
  [System.IO.File]::WriteAllText($Path, $Content, [System.Text.UTF8Encoding]::new($false))
}

function Read-Template {
  param([string]$Name, [hashtable]$Values)
  $templatePath = Join-Path $PSScriptRoot "prompts\$Name"
  $content = [System.IO.File]::ReadAllText($templatePath, [System.Text.Encoding]::UTF8)
  foreach ($key in $Values.Keys) {
    $content = $content.Replace("{{$key}}", [string]$Values[$key])
  }
  return $content
}

function Invoke-ClaudeReadOnly {
  param([string]$Prompt, [string]$OutputPath, [string]$ErrorPath, [string]$WorkingDirectory, [int]$MaxTurns = 16)
  $promptPath = "$OutputPath.prompt.txt"
  Write-Utf8File -Path $promptPath -Content $Prompt
  Push-Location $WorkingDirectory
  try {
    $result = Get-Content -LiteralPath $promptPath -Raw -Encoding UTF8 |
      & $script:ClaudeCommand -p --output-format text --permission-mode plan --max-turns $MaxTurns --effort medium --no-session-persistence --tools 'Read,Glob,Grep,Bash' 2>> $ErrorPath
    Write-Utf8File -Path $OutputPath -Content (($result | Out-String).Trim())
    if ($LASTEXITCODE -ne 0) { throw "Claude 실행 실패(코드 $LASTEXITCODE). 로그: $ErrorPath" }
  } finally {
    Pop-Location
  }
}

function Invoke-Codex {
  param(
    [string]$Prompt,
    [string]$OutputPath,
    [string]$ErrorPath,
    [string]$WorkingDirectory,
    [ValidateSet('read-only', 'workspace-write')]
    [string]$Sandbox
  )
  $promptPath = "$OutputPath.prompt.txt"
  Write-Utf8File -Path $promptPath -Content $Prompt
  $previousErrorActionPreference = $ErrorActionPreference
  try {
    # Codex may write harmless warnings to stderr even when it succeeds. Preserve
    # those warnings in the log and decide success only from the native exit code.
    $ErrorActionPreference = 'Continue'
    Get-Content -LiteralPath $promptPath -Raw -Encoding UTF8 |
      & $script:CodexCommand exec --ephemeral --sandbox $Sandbox --cd $WorkingDirectory --output-last-message $OutputPath - 2>> $ErrorPath | Out-Null
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
  if ($exitCode -ne 0) { throw "Codex 실행 실패(코드 $exitCode). 로그: $ErrorPath" }
}

function Assert-BuildCapacity {
  $os = Get-CimInstance Win32_OperatingSystem
  $freeMemoryGb = [math]::Round($os.FreePhysicalMemory / 1MB, 1)
  $cpu = (Get-Counter '\Processor(_Total)\% Processor Time' -SampleInterval 1 -MaxSamples 1).CounterSamples.CookedValue
  if ($freeMemoryGb -lt 2) { throw "사용 가능한 메모리가 ${freeMemoryGb}GB라 빌드를 시작하지 않습니다." }
  if ($cpu -gt 85) { throw "현재 CPU 사용률이 $([math]::Round($cpu, 0))%라 빌드를 시작하지 않습니다." }
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
if (-not $Task) { $Task = Read-Host 'Claude와 Codex가 함께 처리할 CRM 작업을 입력하세요' }
$Task = $Task.Trim()
if (-not $Task) { throw '작업 내용이 비어 있습니다.' }

$gitStatus = (& git -C $repoRoot status --porcelain | Out-String).Trim()
if ($gitStatus) {
  throw "원본 작업폴더에 저장되지 않은 변경이 있습니다. 먼저 커밋한 뒤 다시 실행해주세요.`n$gitStatus"
}

$script:ClaudeCommand = (Get-Command claude -ErrorAction Stop).Source
$npmPrefix = (& npm prefix -g | Out-String).Trim()
$script:CodexCommand = Join-Path $npmPrefix 'codex.cmd'
if (-not (Test-Path -LiteralPath $script:CodexCommand)) { throw 'Codex CLI를 찾지 못했습니다.' }

& $script:CodexCommand login status | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Codex CLI 로그인이 필요합니다.' }
$claudeAuth = & $script:ClaudeCommand auth status --json 2>$null
if ($LASTEXITCODE -ne 0 -or -not $claudeAuth) { throw 'Claude Code 로그인이 필요합니다.' }

$runId = Get-Date -Format 'yyyyMMdd-HHmmss'
$slug = ($Task.ToLowerInvariant() -replace '[^a-z0-9가-힣]+', '-').Trim('-')
if (-not $slug) { $slug = 'crm-task' }
if ($slug.Length -gt 28) { $slug = $slug.Substring(0, 28).Trim('-') }
$branchName = "ai/$runId-$slug"
$worktreesRoot = Join-Path (Split-Path $repoRoot -Parent) 'troiareuke-crm-ai-worktrees'
$worktreePath = Join-Path $worktreesRoot $runId
$sharedRoot = if ($env:CRM_AI_SHARED_ROOT) { $env:CRM_AI_SHARED_ROOT } else { Join-Path (Split-Path $repoRoot -Parent) 'CRM-AI-RUNS' }
$runRoot = Join-Path $sharedRoot $runId
New-Item -ItemType Directory -Path $worktreesRoot, $runRoot -Force | Out-Null

Write-Utf8File -Path (Join-Path $runRoot '00-task.md') -Content "# CRM 협업 작업`n`n$Task`n"

try {
  Write-Host '[1/7] 격리된 Git 작업공간을 준비합니다...' -ForegroundColor Cyan
  & git -C $repoRoot fetch origin main --quiet
  if ($LASTEXITCODE -ne 0) { throw 'GitHub main 정보를 가져오지 못했습니다.' }
  & git -C $repoRoot worktree add -b $branchName $worktreePath origin/main
  if ($LASTEXITCODE -ne 0) { throw '격리 작업공간을 만들지 못했습니다.' }

  $sourceModules = Join-Path $repoRoot 'node_modules'
  $worktreeModules = Join-Path $worktreePath 'node_modules'
  if ((Test-Path -LiteralPath $sourceModules) -and -not (Test-Path -LiteralPath $worktreeModules)) {
    New-Item -ItemType Junction -Path $worktreeModules -Target $sourceModules | Out-Null
  }

  Write-Host '[2/7] Claude가 제품·사용자·보안 관점의 제안을 작성합니다...' -ForegroundColor Cyan
  $claudeProposalPath = Join-Path $runRoot '01-claude-proposal.md'
  $claudeProposalPrompt = Read-Template '01-claude-proposal.md' @{ TASK = $Task }
  Invoke-ClaudeReadOnly $claudeProposalPrompt $claudeProposalPath (Join-Path $runRoot '01-claude-error.log') $worktreePath 20
  $claudeProposal = [System.IO.File]::ReadAllText($claudeProposalPath)

  Write-Host '[3/7] Codex가 제안의 허점과 구현 가능성을 검토합니다...' -ForegroundColor Cyan
  $codexChallengePath = Join-Path $runRoot '02-codex-challenge.md'
  $codexChallengePrompt = Read-Template '02-codex-challenge.md' @{ TASK = $Task; CLAUDE_PROPOSAL = $claudeProposal }
  Invoke-Codex $codexChallengePrompt $codexChallengePath (Join-Path $runRoot '02-codex-error.log') $worktreePath 'read-only'
  $codexChallenge = [System.IO.File]::ReadAllText($codexChallengePath)

  Write-Host '[4/7] Claude가 두 의견을 합쳐 최종 명세를 확정합니다...' -ForegroundColor Cyan
  $finalSpecPath = Join-Path $runRoot '03-final-spec.md'
  $finalSpecPrompt = Read-Template '03-claude-final-spec.md' @{ TASK = $Task; CLAUDE_PROPOSAL = $claudeProposal; CODEX_CHALLENGE = $codexChallenge }
  Invoke-ClaudeReadOnly $finalSpecPrompt $finalSpecPath (Join-Path $runRoot '03-claude-error.log') $worktreePath 8
  $finalSpec = [System.IO.File]::ReadAllText($finalSpecPath)

  Write-Host '[5/7] Codex가 최종 명세를 구현합니다...' -ForegroundColor Cyan
  $implementationPath = Join-Path $runRoot '04-codex-implementation.md'
  $implementationPrompt = Read-Template '04-codex-implement.md' @{ TASK = $Task; FINAL_SPEC = $finalSpec }
  Invoke-Codex $implementationPrompt $implementationPath (Join-Path $runRoot '04-codex-error.log') $worktreePath 'workspace-write'

  for ($round = 1; $round -le $ReviewRounds; $round++) {
    Write-Host "[6/7] Claude 검토와 Codex 수정을 진행합니다 ($round/$ReviewRounds)..." -ForegroundColor Cyan
    $reviewPath = Join-Path $runRoot ("05-claude-review-{0}.md" -f $round)
    $reviewPrompt = Read-Template '05-claude-review.md' @{ TASK = $Task; FINAL_SPEC = $finalSpec; ROUND = $round }
    Invoke-ClaudeReadOnly $reviewPrompt $reviewPath (Join-Path $runRoot ("05-claude-error-{0}.log" -f $round)) $worktreePath 18
    $review = [System.IO.File]::ReadAllText($reviewPath)

    $fixPath = Join-Path $runRoot ("06-codex-fix-{0}.md" -f $round)
    $fixPrompt = Read-Template '06-codex-fix.md' @{ TASK = $Task; FINAL_SPEC = $finalSpec; CLAUDE_REVIEW = $review; ROUND = $round }
    Invoke-Codex $fixPrompt $fixPath (Join-Path $runRoot ("06-codex-error-{0}.log" -f $round)) $worktreePath 'workspace-write'
  }

  Write-Host '[7/7] 자동 검증과 Git 기록을 만듭니다...' -ForegroundColor Cyan
  if (-not $SkipBuild) {
    Assert-BuildCapacity
    Push-Location $worktreePath
    try {
      & npm.cmd run build *>&1 | Tee-Object -FilePath (Join-Path $runRoot '07-build.log')
      if ($LASTEXITCODE -ne 0) { throw '앱 빌드 검증에 실패했습니다.' }
    } finally {
      Pop-Location
    }
  }

  & git -C $worktreePath add -A
  $stagedFiles = (& git -C $worktreePath diff --cached --name-only | Out-String).Trim()
  if ($stagedFiles) {
    $subject = $Task
    if ($subject.Length -gt 45) { $subject = $subject.Substring(0, 45).Trim() }
    $env:CORE_EDIT = '1'
    try {
      & git -C $worktreePath commit -m "feat(ai): $subject"
      if ($LASTEXITCODE -ne 0) { throw '자동화 결과 커밋에 실패했습니다.' }
    } finally {
      Remove-Item Env:CORE_EDIT -ErrorAction SilentlyContinue
    }
  }

  $summary = @"
# AI 협업 실행 완료

- 작업: $Task
- 브랜치: $branchName
- 작업공간: $worktreePath
- 기록 폴더: $runRoot
- 검토 횟수: $ReviewRounds
- 자동 병합/푸시/배포: 수행하지 않음

사람이 결과를 확인한 후에만 GitHub로 올리고 main에 병합합니다.
"@
  Write-Utf8File -Path (Join-Path $runRoot '99-summary.md') -Content $summary
  Write-Host ''
  Write-Host 'Codex + Claude 협업이 완료되었습니다.' -ForegroundColor Green
  Write-Host "브랜치: $branchName"
  Write-Host "결과 기록: $runRoot"
  Write-Host '아직 main 병합이나 고객 배포는 하지 않았습니다.' -ForegroundColor Yellow
  Start-Process explorer.exe -ArgumentList $runRoot
} catch {
  Write-Utf8File -Path (Join-Path $runRoot '99-failure.md') -Content "# 실행 중단`n`n$($_.Exception.Message)`n"
  Write-Host $_.Exception.Message -ForegroundColor Red
  Write-Host "진행 기록은 보존했습니다: $runRoot" -ForegroundColor Yellow
  exit 1
}
