$ErrorActionPreference = "Stop"

$repo = Split-Path -Parent $MyInvocation.MyCommand.Path
$desktop = [Environment]::GetFolderPath("Desktop")
$shell = New-Object -ComObject WScript.Shell
$logoPng = Join-Path $repo "logo.png"
$iconPath = Join-Path $repo "logo.ico"
$iconBuilder = Join-Path $repo "create_logo_icon.py"

if (Test-Path $iconBuilder) {
    try {
        $shouldRebuildIcon = -not (Test-Path $iconPath)
        if ((-not $shouldRebuildIcon) -and (Test-Path $logoPng)) {
            $shouldRebuildIcon = (Get-Item $logoPng).LastWriteTimeUtc -gt (Get-Item $iconPath).LastWriteTimeUtc
        }
        if ($shouldRebuildIcon) {
            $python = Get-Command py -ErrorAction SilentlyContinue
            if ($python) {
                & $python.Source -3 $iconBuilder | Out-Null
            } else {
                $python = Get-Command python -ErrorAction SilentlyContinue
                if ($python) {
                    & $python.Source $iconBuilder | Out-Null
                }
            }
        }
    } catch {
    }
}

$items = @(
    @{ Name = "Brotherhood-UI Launcher"; Script = Join-Path $repo "Brotherhood-UI Launcher.bat" }
)

foreach ($item in $items) {
    $shortcut = $shell.CreateShortcut((Join-Path $desktop ($item.Name + ".lnk")))
    $shortcut.TargetPath = $env:ComSpec
    $shortcut.Arguments = '/c ""' + $item.Script + '""'
    $shortcut.WorkingDirectory = $repo
    if (Test-Path $iconPath) {
        $shortcut.IconLocation = $iconPath
    } else {
        $shortcut.IconLocation = "C:\Windows\System32\SHELL32.dll,220"
    }
    $shortcut.Save()
}

$guidePath = Join-Path $desktop "Brotherhood-UI Quick Start.txt"
$guide = @"
Brotherhood-UI launcher

1. Double-click "Brotherhood-UI Launcher"
   A small window will open.

2. Click "Start"
   This starts the backend, starts OpenClaw sync, and opens the board.

3. Click "Check" if you want to verify things are running.

4. Click "Open Board" if you only want to reopen the UI page.

5. Click "Stop" when you want to stop everything.

Project folder:
$repo
"@
Set-Content -Path $guidePath -Value $guide -Encoding UTF8

$legacyPaths = @(
    (Join-Path $desktop "Brotherhood-UI 使用说明.txt"),
    (Join-Path $desktop "启动 Brotherhood-UI.lnk"),
    (Join-Path $desktop "检查 Brotherhood-UI.lnk"),
    (Join-Path $desktop "停止 Brotherhood-UI.lnk"),
    (Join-Path $desktop "Start Brotherhood-UI.lnk"),
    (Join-Path $desktop "Check Brotherhood-UI.lnk"),
    (Join-Path $desktop "Stop Brotherhood-UI.lnk")
)

foreach ($legacyPath in $legacyPaths) {
    if (Test-Path $legacyPath) {
        Remove-Item -Path $legacyPath -Force
    }
}

Write-Host "Desktop shortcuts and guide created."
