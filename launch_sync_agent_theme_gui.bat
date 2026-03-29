@echo off
cd /d "%~dp0"
python sync_agent_theme.py --gui
if errorlevel 1 (
  echo.
  echo Sync tool exited with errors.
)
pause
