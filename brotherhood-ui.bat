@echo off
setlocal
set SCRIPT_DIR=%~dp0
set PYTHONUTF8=1
py -3 "%SCRIPT_DIR%python_runtime.py" run-script "%SCRIPT_DIR%brotherhood_control_runtime.py" %*
if errorlevel 1 (
  python "%SCRIPT_DIR%python_runtime.py" run-script "%SCRIPT_DIR%brotherhood_control_runtime.py" %*
)
endlocal
