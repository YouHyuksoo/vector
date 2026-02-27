@echo off
setlocal
set PORT=3100
echo Killing processes on port %PORT%...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%PORT% " ^| findstr "LISTENING"') do (
    echo   Terminating PID: %%a
    taskkill /F /PID %%a >nul 2>&1
)
echo Done.
pause
