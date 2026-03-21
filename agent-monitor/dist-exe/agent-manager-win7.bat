@echo off
cd /d "%~dp0"
echo Starting Agent Manager...
node-win7.exe server.cjs %*
if errorlevel 1 (
  echo.
  echo [ERROR] Agent Manager failed to start.
  pause
)