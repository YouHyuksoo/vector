@echo off
chcp 65001 > nul
setlocal

set REPO_URL=https://github.com/YouHyuksoo/vector.git
set PM2_CONFIG=ecosystem.config.cjs

:MENU
cls
echo ========================================================
echo        Vector Log Collector - Management Tool (v1.0)
echo ========================================================
echo.
echo   [Installation ^& Setup]
echo   1. Git Clone (Download project source)
echo   2. Initial Setup (PM2 install + auto-startup + deploy)
echo.
echo   [Update ^& Deploy]
echo   3. Full Upgrade (Git Pull + Install + Build + Restart)
echo.
echo   [Individual Tasks]
echo   4. Git Pull (Fetch latest source)
echo   5. npm install (Install dependencies)
echo   6. Build (Backend + Frontend)
echo.
echo   [Server Management]
echo   7. Start Server (PM2 Start)
echo   8. Restart Server (PM2 Restart)
echo   9. Stop Server (PM2 Stop)
echo   10. Server Status (PM2 List)
echo   11. View Logs (PM2 Logs)
echo.
echo   [PM2 Management]
echo   12. Install PM2 Globally (npm i -g pm2)
echo   13. Register Auto-Startup (Windows Service)
echo   14. PM2 Monitor (Real-time Dashboard)
echo   15. PM2 Flush Logs (Clear all log files)
echo   16. PM2 Delete All (Remove all processes)
echo   17. PM2 Save (Save current process list)
echo.
echo   [Utilities]
echo   18. Kill Port (Stop process on specific port)
echo   19. Check .env File
echo.
echo   0. Exit
echo.
echo ========================================================
set /p choice="Select an option (0-19): "

if "%choice%"=="1" goto CLONE
if "%choice%"=="2" goto INITIAL_SETUP
if "%choice%"=="3" goto FULL_UPGRADE
if "%choice%"=="4" goto GIT_PULL
if "%choice%"=="5" goto NPM_INSTALL
if "%choice%"=="6" goto BUILD
if "%choice%"=="7" goto START_SERVER
if "%choice%"=="8" goto RESTART_SERVER
if "%choice%"=="9" goto STOP_SERVER
if "%choice%"=="10" goto STATUS
if "%choice%"=="11" goto VIEW_LOG
if "%choice%"=="12" goto PM2_INSTALL
if "%choice%"=="13" goto AUTO_STARTUP
if "%choice%"=="14" goto PM2_MONIT
if "%choice%"=="15" goto PM2_FLUSH
if "%choice%"=="16" goto PM2_DELETE
if "%choice%"=="17" goto PM2_SAVE
if "%choice%"=="18" goto KILL_PORT
if "%choice%"=="19" goto CHECK_ENV
if "%choice%"=="0" goto END
goto MENU

:CLONE
cls
echo ========================================================
echo        Git Clone (Download Project Source)
echo ========================================================
echo.
echo Cloning repository from GitHub...
echo (Warning: Will fail if directory already exists)
echo.
git clone %REPO_URL%
echo.
echo [Done] Clone completed.
echo [Note] Move this file into the 'vector' folder,
echo        then run option 2 (Initial Setup).
echo.
pause
goto MENU

:INITIAL_SETUP
cls
echo ========================================================
echo        Initial Setup
echo ========================================================
echo.
echo [IMPORTANT] Run as Administrator!
echo.
pause

echo.
echo [1/5] Installing PM2 and Windows startup tools...
call npm install -g pm2 pm2-windows-startup
IF %ERRORLEVEL% NEQ 0 (
    echo [ERROR] npm global install failed! Is Node.js installed?
    pause
    goto MENU
)

echo.
echo [2/5] Registering Windows auto-startup...
call pm2-startup install
IF %ERRORLEVEL% NEQ 0 (
    echo [WARN] Already registered or permission issue. Continuing...
)

echo.
echo [3/5] Installing backend dependencies...
call npm ci
IF %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Backend npm install failed!
    pause
    goto MENU
)

echo.
echo [4/5] Installing frontend dependencies and building...
call npm ci --prefix frontend
call npm run build
call npm run build:frontend
IF %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Build failed!
    pause
    goto MENU
)

echo.
echo [5/5] Starting server with PM2...
call pm2 start %PM2_CONFIG%
call pm2 save
echo.
echo ========================================================
echo   Initial setup completed successfully!
echo.
echo   Backend  : http://localhost:3110
echo   Frontend : http://localhost:3100
echo ========================================================
pause
goto MENU

:FULL_UPGRADE
cls
echo ========================================================
echo        Full Upgrade (Pull + Install + Build + Restart)
echo ========================================================
echo.
echo [1/5] Pulling latest source...
git pull
IF %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Git pull failed!
    pause
    goto MENU
)
echo.
echo [2/5] Installing backend dependencies...
call npm ci
echo.
echo [3/5] Installing frontend dependencies...
call npm ci --prefix frontend
echo.
echo [4/5] Building backend + frontend...
call npm run build
call npm run build:frontend
IF %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Build failed!
    pause
    goto MENU
)
echo.
echo [5/5] Restarting server...
call pm2 restart %PM2_CONFIG%
IF %ERRORLEVEL% NEQ 0 (
    echo [WARN] No running process found. Starting fresh...
    call pm2 start %PM2_CONFIG%
)
call pm2 save
echo.
echo ========================================================
echo   Full upgrade completed successfully!
echo ========================================================
pause
goto MENU

:GIT_PULL
cls
echo ========================================================
echo        Git Pull (Fetch Latest Source)
echo ========================================================
git pull
IF %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Git pull failed!
) else (
    echo [OK] Latest source fetched successfully.
)
pause
goto MENU

:NPM_INSTALL
cls
echo ========================================================
echo        npm install (Install Dependencies)
echo ========================================================
echo.
echo Installing backend dependencies...
call npm ci
echo.
echo Installing frontend dependencies...
call npm ci --prefix frontend
IF %ERRORLEVEL% NEQ 0 (
    echo [ERROR] npm install failed!
) else (
    echo [OK] All dependencies installed.
)
pause
goto MENU

:BUILD
cls
echo ========================================================
echo        Build (Backend + Frontend)
echo ========================================================
echo.
echo Building backend (TypeScript)...
call npm run build
IF %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Backend build failed!
    pause
    goto MENU
)
echo.
echo Building frontend (Next.js)...
call npm run build:frontend
IF %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Frontend build failed!
) else (
    echo [OK] Build completed successfully.
)
pause
goto MENU

:START_SERVER
cls
echo ========================================================
echo        Start Server (PM2 Start)
echo ========================================================
call pm2 start %PM2_CONFIG%
IF %ERRORLEVEL% NEQ 0 (
    echo [WARN] Already running or error. Trying restart...
    call pm2 restart %PM2_CONFIG%
)
call pm2 save
echo.
echo [OK] Server start command completed.
echo.
echo   Backend  : http://localhost:3110
echo   Frontend : http://localhost:3100
pause
goto MENU

:RESTART_SERVER
cls
echo ========================================================
echo        Restart Server (PM2 Restart)
echo ========================================================
call pm2 restart %PM2_CONFIG%
IF %ERRORLEVEL% NEQ 0 (
    echo [WARN] No running process. Starting fresh...
    call pm2 start %PM2_CONFIG%
    call pm2 save
) else (
    echo [OK] Server restarted successfully.
)
pause
goto MENU

:STOP_SERVER
cls
echo ========================================================
echo        Stop Server (PM2 Stop)
echo ========================================================
call pm2 stop all
echo [OK] All services stopped.
pause
goto MENU

:STATUS
cls
echo ========================================================
echo        Server Status (PM2 List)
echo ========================================================
echo.
call pm2 list
echo.
echo --------------------------------------------------------
echo Port Usage:
echo   Backend  (Fastify)  : 3110
echo   Frontend (Next.js)  : 3100
echo   Redis               : 6379
echo   Vector Aggregator   : 6000, 8687
echo   Vector Agent API    : 8686
echo --------------------------------------------------------
pause
goto MENU

:VIEW_LOG
cls
echo ========================================================
echo        View Logs (PM2 Logs)
echo ========================================================
echo Press Ctrl+C to exit log view.
echo.
call pm2 logs
pause
goto MENU

:PM2_INSTALL
cls
echo ========================================================
echo        Install PM2 Globally
echo ========================================================
echo.
echo Installing PM2 and related tools...
call npm install -g pm2 pm2-windows-startup
IF %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Installation failed! Is Node.js installed?
) else (
    echo.
    echo [OK] PM2 installed successfully.
    echo.
    echo Installed versions:
    call pm2 --version
)
pause
goto MENU

:AUTO_STARTUP
cls
echo ========================================================
echo        Register Auto-Startup (Windows Service)
echo ========================================================
echo.
echo [IMPORTANT] Run as Administrator!
echo.
echo [1/3] Checking pm2-windows-startup...
call npm list -g pm2-windows-startup > nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    echo Installing pm2-windows-startup...
    call npm install -g pm2-windows-startup
)

echo.
echo [2/3] Registering startup service...
call pm2-startup install
IF %ERRORLEVEL% NEQ 0 (
    echo [WARN] Already registered or permission issue.
) else (
    echo [OK] Registered for auto-startup.
)

echo.
echo [3/3] Saving current process list...
call pm2 save
echo.
echo ========================================================
echo   Auto-startup configured! Server will start on reboot.
echo ========================================================
pause
goto MENU

:PM2_MONIT
cls
echo ========================================================
echo        PM2 Monitor (Real-time Dashboard)
echo ========================================================
echo.
echo Press Ctrl+C to exit monitor.
echo.
call pm2 monit
pause
goto MENU

:PM2_FLUSH
cls
echo ========================================================
echo        PM2 Flush Logs (Clear All Log Files)
echo ========================================================
echo.
call pm2 flush
echo.
echo [OK] All PM2 log files cleared.
pause
goto MENU

:PM2_DELETE
cls
echo ========================================================
echo        PM2 Delete All (Remove All Processes)
echo ========================================================
echo.
echo [WARNING] This will remove all PM2 processes!
echo.
set /p confirm="Are you sure? (Y/N): "
if /i "%confirm%"=="Y" (
    call pm2 delete all
    echo [OK] All processes removed.
) else (
    echo [Cancelled]
)
pause
goto MENU

:PM2_SAVE
cls
echo ========================================================
echo        PM2 Save (Save Current Process List)
echo ========================================================
echo.
call pm2 save
echo.
echo [OK] Current process list saved.
echo     Will be restored on next PM2 startup.
pause
goto MENU

:KILL_PORT
cls
echo ========================================================
echo        Kill Port (Stop Process on Specific Port)
echo ========================================================
echo.
set /p port="Enter port number to kill: "
echo.
echo Searching for process on port %port%...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :%port% ^| findstr LISTENING') do (
    echo Found PID: %%a
    taskkill /PID %%a /F
    echo [OK] Process %%a killed.
)
echo.
echo Done.
pause
goto MENU

:CHECK_ENV
cls
echo ========================================================
echo        Check .env File
echo ========================================================
echo.
if exist .env (
    echo [OK] .env file exists:
    echo --------------------------------------------------------
    type .env
    echo.
    echo --------------------------------------------------------
) else (
    echo [WARNING] .env file NOT found!
    echo.
    echo Copy from .env.example:
    echo   copy .env.example .env
    echo.
    echo Then edit .env with your actual values:
    echo   - ORACLE_USER / ORACLE_PASSWORD / ORACLE_CONNECT_STRING
    echo   - REDIS_HOST / REDIS_PORT
    echo   - RAW_LOG_BASE_PATH
)
echo.
pause
goto MENU

:END
endlocal
exit
