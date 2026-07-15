[CmdletBinding()]
param(
    [string]$ExpectedBranch = 'autosave/laptop-99048'
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
$GitDir = Join-Path $RepoRoot '.git'
$LogPath = Join-Path $GitDir 'autosave.log'
$CoreLock = Join-Path $RepoRoot 'scripts\core-lock.mjs'
$MutexName = 'Local\TroiareukeCrmAutosaveLaptop99048'

function Write-AutosaveLog {
    param([string]$Message)
    $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    Add-Content -LiteralPath $LogPath -Value "[$stamp] $Message" -Encoding UTF8
}

function Unstage-Path {
    param([string]$Path)
    & git restore --staged -- $Path 2>$null
}

$mutex = [System.Threading.Mutex]::new($false, $MutexName)
$hasLock = $false

try {
    $hasLock = $mutex.WaitOne(0)
    if (-not $hasLock) {
        exit 0
    }

    Set-Location -LiteralPath $RepoRoot

    $branch = (& git branch --show-current 2>$null | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or $branch -ne $ExpectedBranch) {
        Write-AutosaveLog "SKIP branch=$branch expected=$ExpectedBranch"
        exit 0
    }

    $changed = @()
    $changed += @(& git diff --name-only --diff-filter=ACDMRTUXB)
    $changed += @(& git diff --cached --name-only --diff-filter=ACDMRTUXB)
    $changed += @(& git ls-files --others --exclude-standard)
    $changed = @($changed | Where-Object { $_ } | Sort-Object -Unique)

    if ($changed.Count -eq 0) {
        $trackingBranch = "origin/$ExpectedBranch"
        $trackingRef = "refs/remotes/$trackingBranch"
        & git show-ref --verify --quiet $trackingRef
        $hasTrackingRef = $LASTEXITCODE -eq 0
        $aheadText = ''
        if ($hasTrackingRef) {
            $aheadText = (& git rev-list --count "$trackingBranch..HEAD" 2>$null | Out-String).Trim()
        }
        if ($LASTEXITCODE -eq 0 -and $aheadText -match '^\d+$' -and [int]$aheadText -gt 0) {
            & git push --quiet origin "HEAD:refs/heads/$ExpectedBranch"
            if ($LASTEXITCODE -ne 0) {
                Write-AutosaveLog "RETRY_PUSH_FAILED pending=$aheadText"
                exit 1
            }
            & git update-ref $trackingRef HEAD
            Write-AutosaveLog "RETRY_PUSH_OK commits=$aheadText"
        }
        exit 0
    }

    foreach ($path in $changed) {
        $normalized = $path.Replace('\', '/')

        & node $CoreLock check $normalized *> $null
        if ($LASTEXITCODE -ne 0) {
            Unstage-Path -Path $path
            Write-AutosaveLog "CORE_BLOCKED $normalized"
            continue
        }

        $riskyName = $normalized -match '(?i)(^|/)(\.env($|\.)|secrets?(/|$)|credentials?(/|$)|[^/]*비밀번호[^/]*|[^/]*password[^/]*)'
        $riskyType = $normalized -match '(?i)\.(db|sqlite3?|bak|dump|csv|xlsx?|pem|pfx|p12)$'
        if ($riskyName -or $riskyType) {
            Unstage-Path -Path $path
            Write-AutosaveLog "SENSITIVE_PATH_BLOCKED $normalized"
            continue
        }

        if (Test-Path -LiteralPath $path -PathType Leaf) {
            $size = (Get-Item -LiteralPath $path).Length
            if ($size -gt 25MB) {
                Unstage-Path -Path $path
                Write-AutosaveLog "LARGE_FILE_BLOCKED $normalized bytes=$size"
                continue
            }
        }

        & git add -A -- $path
        if ($LASTEXITCODE -ne 0) {
            Write-AutosaveLog "ADD_FAILED $normalized"
        }
    }

    $staged = @(& git diff --cached --name-only)
    if ($staged.Count -eq 0) {
        exit 0
    }

    $staged | & node $CoreLock check-stdin *> $null
    if ($LASTEXITCODE -ne 0) {
        foreach ($path in $staged) {
            Unstage-Path -Path $path
        }
        Write-AutosaveLog 'CORE_GUARD_BLOCKED_STAGED_SET'
        exit 0
    }

    $patch = (& git diff --cached --no-ext-diff --unified=0 | Out-String)
    $secretPatterns = @(
        'gh[pousr]_[A-Za-z0-9_]{20,}',
        'AKIA[0-9A-Z]{16}',
        'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.',
        '(?i)-----BEGIN [A-Z ]*PRIVATE KEY-----'
    )
    foreach ($pattern in $secretPatterns) {
        if ($patch -match $pattern) {
            foreach ($path in $staged) {
                Unstage-Path -Path $path
            }
            Write-AutosaveLog 'SECRET_CONTENT_BLOCKED'
            exit 0
        }
    }

    $message = 'autosave(laptop): ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss K')
    & git commit --quiet -m $message
    if ($LASTEXITCODE -ne 0) {
        Write-AutosaveLog 'COMMIT_FAILED'
        exit 1
    }

    & git push --quiet origin "HEAD:refs/heads/$ExpectedBranch"
    if ($LASTEXITCODE -ne 0) {
        Write-AutosaveLog 'PUSH_FAILED'
        exit 1
    }

    & git update-ref "refs/remotes/origin/$ExpectedBranch" HEAD
    Write-AutosaveLog "PUSH_OK $message"
}
catch {
    Write-AutosaveLog ('ERROR ' + $_.Exception.Message)
    exit 1
}
finally {
    if ($hasLock) {
        $mutex.ReleaseMutex()
    }
    $mutex.Dispose()
}
