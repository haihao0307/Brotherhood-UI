@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%create_desktop_shortcuts.ps1"
if errorlevel 1 (
  pause
  exit /b 1
)
pause
endlocal
