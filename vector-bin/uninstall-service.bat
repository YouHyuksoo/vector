@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul 2>&1
:: =============================================================================
::  Vector Agent - Windows 서비스 제거 스크립트
:: =============================================================================
::  Vector의 내장 서비스 명령어(vector service uninstall)를 사용하여
::  등록된 서비스를 중지하고 제거합니다.
::  관리자 권한이 필요합니다.
:: =============================================================================

:: 관리자 권한 확인
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  [오류] 관리자 권한이 필요합니다.
    echo  이 파일을 우클릭하고 "관리자 권한으로 실행"을 선택하세요.
    echo.
    pause
    exit /b 1
)

set "VECTOR_DIR=%~dp0"
set "VECTOR_EXE=%VECTOR_DIR%vector.exe"

:: TOML 파일명으로 서비스명 추정
set "TOML_FILE="
for %%f in ("%VECTOR_DIR%*.toml") do set "TOML_FILE=%%f"

if "%TOML_FILE%"=="" (
    echo.
    echo  [알림] TOML 파일을 찾을 수 없어 서비스명을 확인할 수 없습니다.
    echo.
    set /p "SERVICE_NAME=  서비스명을 직접 입력하세요 (예: VectorAgent_AOI): "
) else (
    for %%f in ("%TOML_FILE%") do set "EQUIP_NAME=%%~nf"
    set "SERVICE_NAME=VectorAgent_!EQUIP_NAME!"
)

echo.
echo  ============================================
echo   Vector Agent 서비스 제거
echo  ============================================
echo   서비스명 : %SERVICE_NAME%
echo  ============================================
echo.

:: 서비스 존재 확인
sc query "%SERVICE_NAME%" >nul 2>&1
if %errorlevel% neq 0 (
    echo  [알림] 등록된 서비스(%SERVICE_NAME%)를 찾을 수 없습니다.
    echo.
    pause
    exit /b 0
)

:: 서비스 중지
echo  서비스를 중지합니다...
"%VECTOR_EXE%" service stop --name "%SERVICE_NAME%" >nul 2>&1
timeout /t 3 /nobreak >nul

:: 서비스 제거
echo  서비스를 제거합니다...
"%VECTOR_EXE%" service uninstall --name "%SERVICE_NAME%"

if %errorlevel% equ 0 (
    echo.
    echo  [성공] 서비스가 제거되었습니다.
    echo.
) else (
    echo.
    echo  [실패] 서비스 제거에 실패했습니다.
    echo  services.msc 에서 수동으로 확인하세요.
    echo.
)

pause
