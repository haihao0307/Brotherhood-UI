param(
    [Parameter(Position = 0)]
    [string]$Action = "help",

    [Parameter(Position = 1, ValueFromRemainingArguments = $true)]
    [string[]]$Rest
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$RuntimeDir = Join-Path $RepoRoot ".runtime"
$BridgeScript = Join-Path $RepoRoot "openclaw_bridge.py"
$BackendScript = Join-Path $RepoRoot "backend\app.py"
$WatcherScript = Join-Path $RepoRoot "openclaw_session_watch.py"
$DoctorScript = Join-Path $RepoRoot "openclaw_sync_doctor.py"
$BoardPort = 18791
$BackendPidFile = Join-Path $RuntimeDir "backend.pid"
$WatcherPidFile = Join-Path $RuntimeDir "watcher.pid"
$SyncStatusFile = Join-Path $RuntimeDir "openclaw-sync-status.json"

function Get-PythonCommand {
    $py = Get-Command py -ErrorAction SilentlyContinue
    if ($py) {
        return @($py.Source, "-3")
    }

    $python = Get-Command python -ErrorAction SilentlyContinue
    if ($python) {
        return @($python.Source)
    }

    throw "Python 3 was not found. Install Python and make sure 'py' or 'python' is available."
}

function Invoke-PythonScript {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ScriptPath,

        [string[]]$ScriptArgs = @()
    )

    $pythonCmd = Get-PythonCommand
    $exe = $pythonCmd[0]
    $prefix = @()
    if ($pythonCmd.Count -gt 1) {
        $prefix = $pythonCmd[1..($pythonCmd.Count - 1)]
    }

    & $exe @prefix $ScriptPath @ScriptArgs
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
}

function Ensure-RuntimeDir {
    if (-not (Test-Path $RuntimeDir)) {
        New-Item -ItemType Directory -Path $RuntimeDir | Out-Null
    }
}

function Get-PidFromFile {
    param([string]$Path)

    if (-not (Test-Path $Path)) {
        return $null
    }

    try {
        return [int](Get-Content -Path $Path -Raw).Trim()
    } catch {
        return $null
    }
}

function Test-ProcessAlive {
    param([int]$ProcessId)

    try {
        $null = Get-Process -Id $ProcessId -ErrorAction Stop
        return $true
    } catch {
        return $false
    }
}

function Write-PidFile {
    param(
        [string]$Path,
        [int]$ProcessId
    )

    Ensure-RuntimeDir
    Set-Content -Path $Path -Value $ProcessId
}

function Remove-PidFile {
    param([string]$Path)

    if (Test-Path $Path) {
        Remove-Item -Path $Path -Force
    }
}

function Get-SyncHeartbeatAgeSeconds {
    if (-not (Test-Path $SyncStatusFile)) {
        return $null
    }

    try {
        $status = Get-Content -Path $SyncStatusFile -Raw | ConvertFrom-Json
        if ($null -eq $status.heartbeatAt) {
            return $null
        }
        return [int]([DateTimeOffset]::UtcNow.ToUnixTimeSeconds() - [int][double]$status.heartbeatAt)
    } catch {
        return $null
    }
}

function Get-BoardUrlCandidates {
    $candidates = New-Object System.Collections.Generic.List[string]
    $candidates.Add(("http://127.0.0.1:{0}" -f $BoardPort))

    try {
        $addresses = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
            Where-Object {
                $_.IPAddress -ne "127.0.0.1" -and
                $_.IPAddress -notlike "169.254.*" -and
                $_.IPAddress -ne "0.0.0.0"
            } |
            Sort-Object -Property InterfaceMetric, SkipAsSource, IPAddress

        foreach ($address in $addresses) {
            $url = "http://{0}:{1}" -f $address.IPAddress, $BoardPort
            if (-not $candidates.Contains($url)) {
                $candidates.Add($url)
            }
        }
    } catch {
        try {
            $fallbackAddresses = [System.Net.Dns]::GetHostAddresses([System.Net.Dns]::GetHostName()) |
                Where-Object {
                    $_.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork -and
                    $_.IPAddressToString -ne "127.0.0.1" -and
                    $_.IPAddressToString -notlike "169.254.*"
                }

            foreach ($address in $fallbackAddresses) {
                $url = "http://{0}:{1}" -f $address.IPAddressToString, $BoardPort
                if (-not $candidates.Contains($url)) {
                    $candidates.Add($url)
                }
            }
        } catch {
        }
    }

    return $candidates.ToArray()
}

function Test-BoardUrl {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Url,

        [int]$TimeoutSeconds = 2
    )

    try {
        $healthUrl = "{0}/health" -f $Url.TrimEnd("/")
        $response = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec $TimeoutSeconds
        return ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300)
    } catch {
        return $false
    }
}

function Resolve-BoardUrl {
    param(
        [int]$WaitSeconds = 0
    )

    $deadline = (Get-Date).AddSeconds($WaitSeconds)
    $candidates = Get-BoardUrlCandidates
    $bestFallback = if ($candidates.Count -gt 1) { $candidates[1] } else { $candidates[0] }

    do {
        foreach ($url in $candidates) {
            if (Test-BoardUrl -Url $url) {
                return $url
            }
        }

        if ((Get-Date) -ge $deadline) {
            break
        }

        Start-Sleep -Milliseconds 500
    } while ($true)

    return $bestFallback
}

function Show-Usage {
    @"
Brotherhood-UI Windows helper

Usage:
  .\brotherhood-ui.bat serve
  .\brotherhood-ui.bat watch
  .\brotherhood-ui.bat auto
  .\brotherhood-ui.bat doctor
  .\brotherhood-ui.bat stop
  .\brotherhood-ui.bat open
  .\brotherhood-ui.bat start "Check the OpenClaw docs structure"
  .\brotherhood-ui.bat phase "Reading docs and organizing the plan"
  .\brotherhood-ui.bat phase "Implementing the frontend mapping logic" --state executing
  .\brotherhood-ui.bat done "Task completed, back to standby"
  .\brotherhood-ui.bat fail "Blocked, handling the error"
  .\brotherhood-ui.bat status

Commands:
  serve   Start the backend in a new PowerShell window
  watch   Watch local OpenClaw chat and sync it into the board
  auto    Start backend + OpenClaw watcher, then open the board
  doctor  Check backend, watcher, state file, and OpenClaw session wiring
  stop    Stop the backend and watcher started by this helper
  open    Open the board in your browser
  start   Start a new task from the original request text
  phase   Update the current working phase
  done    Finish the current task and return to idle
  fail    Mark the current task as failed or blocked
  status  Print the current board state
"@ | Write-Host
}

function Start-BackendWindow {
    if (Resolve-BoardUrl -WaitSeconds 1) {
        if (Test-BoardUrl -Url (Resolve-BoardUrl -WaitSeconds 1)) {
            $preferredUrl = Resolve-BoardUrl -WaitSeconds 1
            Write-Host "Backend is already running."
            Write-Host "Board URL: $preferredUrl"
            return
        }
    }

    $pythonCmd = Get-PythonCommand
    $exe = $pythonCmd[0]
    $prefix = @()
    if ($pythonCmd.Count -gt 1) {
        $prefix = $pythonCmd[1..($pythonCmd.Count - 1)]
    }

    $argList = @()
    $argList += "-NoExit"
    $argList += "-Command"
    $commandParts = @(
        "Set-Location '$RepoRoot'",
        "& '$exe' $($prefix -join ' ') '$BackendScript'"
    )
    $argList += ($commandParts -join "; ")

    $proc = Start-Process powershell -ArgumentList $argList -PassThru
    Write-PidFile -Path $BackendPidFile -Pid $proc.Id
    $preferredUrl = Resolve-BoardUrl -WaitSeconds 6
    Write-Host "Backend started in a new window."
    Write-Host "Board URL: $preferredUrl"
}

function Start-OpenClawWatcherWindow {
    $existingPid = Get-PidFromFile -Path $WatcherPidFile
    $heartbeatAge = Get-SyncHeartbeatAgeSeconds
    if ($existingPid -and (Test-ProcessAlive -Pid $existingPid) -and $heartbeatAge -ne $null -and $heartbeatAge -lt 15) {
        Write-Host "OpenClaw watcher is already running."
        return
    }

    $pythonCmd = Get-PythonCommand
    $exe = $pythonCmd[0]
    $prefix = @()
    if ($pythonCmd.Count -gt 1) {
        $prefix = $pythonCmd[1..($pythonCmd.Count - 1)]
    }

    $argList = @()
    $argList += "-NoExit"
    $argList += "-Command"
    $commandParts = @(
        "Set-Location '$RepoRoot'",
        "& '$exe' $($prefix -join ' ') '$WatcherScript' --bootstrap-current"
    )
    $argList += ($commandParts -join "; ")

    $proc = Start-Process powershell -ArgumentList $argList -PassThru
    Write-PidFile -Path $WatcherPidFile -Pid $proc.Id
    Write-Host "OpenClaw watcher started in a new window."
}

function Stop-ManagedProcess {
    param(
        [string]$PidFile,
        [string]$Name
    )

    $targetProcessId = Get-PidFromFile -Path $PidFile
    if (-not $targetProcessId) {
        Write-Host "$Name is not tracked by this helper."
        return
    }

    if (Test-ProcessAlive -ProcessId $targetProcessId) {
        Stop-Process -Id $targetProcessId -Force
        Write-Host "$Name stopped."
    } else {
        Write-Host "$Name is already stopped."
    }

    Remove-PidFile -Path $PidFile
}

switch ($Action.ToLowerInvariant()) {
    "help" {
        Show-Usage
        break
    }
    "serve" {
        Start-BackendWindow
        break
    }
    "watch" {
        Start-OpenClawWatcherWindow
        break
    }
    "auto" {
        Start-BackendWindow
        Start-Sleep -Seconds 2
        Start-OpenClawWatcherWindow
        Start-Sleep -Seconds 1
        $preferredUrl = Resolve-BoardUrl -WaitSeconds 6
        Start-Process $preferredUrl
        Write-Host "Opened browser: $preferredUrl"
        break
    }
    "doctor" {
        Invoke-PythonScript -ScriptPath $DoctorScript
        break
    }
    "stop" {
        Stop-ManagedProcess -PidFile $WatcherPidFile -Name "OpenClaw watcher"
        Stop-ManagedProcess -PidFile $BackendPidFile -Name "Backend"
        if (Test-Path $SyncStatusFile) {
            Remove-Item -Path $SyncStatusFile -Force
        }
        break
    }
    "open" {
        $preferredUrl = Resolve-BoardUrl -WaitSeconds 6
        Start-Process $preferredUrl
        Write-Host "Opened browser: $preferredUrl"
        break
    }
    "start" {
        if (-not $Rest -or $Rest.Count -eq 0) {
            throw "start requires the original task text."
        }
        Invoke-PythonScript -ScriptPath $BridgeScript -ScriptArgs @("start", ($Rest -join " "))
        break
    }
    "phase" {
        if (-not $Rest -or $Rest.Count -eq 0) {
            throw "phase requires a work note."
        }
        $phaseArgs = @("phase") + $Rest
        Invoke-PythonScript -ScriptPath $BridgeScript -ScriptArgs $phaseArgs
        break
    }
    "done" {
        $detail = if ($Rest.Count -gt 0) { $Rest -join " " } else { "Task completed, back to standby" }
        Invoke-PythonScript -ScriptPath $BridgeScript -ScriptArgs @("done", $detail)
        break
    }
    "fail" {
        $detail = if ($Rest.Count -gt 0) { $Rest -join " " } else { "Blocked, handling the error" }
        Invoke-PythonScript -ScriptPath $BridgeScript -ScriptArgs @("fail", $detail)
        break
    }
    "status" {
        Invoke-PythonScript -ScriptPath $BridgeScript -ScriptArgs @("status", "--json")
        break
    }
    default {
        throw "Unknown command: $Action`nRun .\brotherhood-ui.bat help"
    }
}
