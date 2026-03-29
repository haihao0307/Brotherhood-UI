@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
set "PYTHONUTF8=1"
py -3 "%SCRIPT_DIR%python_runtime.py" run-script "%SCRIPT_DIR%brotherhood_ui_launcher.py"
if errorlevel 1 (
  python "%SCRIPT_DIR%python_runtime.py" run-script "%SCRIPT_DIR%brotherhood_ui_launcher.py"
)
endlocal
