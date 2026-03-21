@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul 2>&1
:: =============================================================================
::  Vector Agent - 수동 시작 스크립트
:: =============================================================================
::  Vector Agent를 수동으로 시작합니다.
::  이미 실행 중이면 경고를 표시합니다.
:: =============================================================================

set "VECTOR_DIR=%~dp0"
set "VECTOR_EXE=%VECTOR_DIR%vector.exe"

:: vector.exe 존재 확인
if not exist "%VECTOR_EXE%" (
    echo.
    echo  [오류] vector.exe를 찾을 수 없습니다.
    echo  경로: %VECTOR_EXE%
    echo.
    pause
    exit /b 1
)

:: 이미 실행 중인지 확인
tasklist /fi "imagename eq vector.exe" 2>nul | find /i "vector.exe" >nul
if %errorlevel% equ 0 (
    echo.
    echo  [알림] Vector가 이미 실행 중입니다.
    echo  재시작하려면 먼저 stop-vector.bat을 실행하세요.
    echo.
    pause
    exit /b 0
)

:: TOML 파일 자동 감지
set "TOML_FILE="
for %%f in ("%VECTOR_DIR%*.toml") do set "TOML_FILE=%%f"

if "%TOML_FILE%"=="" (
    echo.
    echo  [오류] TOML 설정 파일을 찾을 수 없습니다.
    echo  이 폴더에 설비별 .toml 파일을 넣어주세요.
    echo.
    pause
    exit /b 1
)

for %%f in ("%TOML_FILE%") do set "EQUIP_NAME=%%~nxf"

:: TOML에서 data_dir 경로를 읽어 폴더가 없으면 자동 생성
for /f "tokens=2 delims==" %%d in ('findstr /i "data_dir" "%TOML_FILE%"') do (
    set "DATA_DIR=%%~d"
    set "DATA_DIR=!DATA_DIR: =!"
    set "DATA_DIR=!DATA_DIR:"=!"
    if not exist "!DATA_DIR!" (
        mkdir "!DATA_DIR!" 2>nul
        echo  [자동생성] data_dir 폴더 생성: !DATA_DIR!
    )
)

echo.
echo  ============================================
echo   Vector Agent 시작
echo  ============================================
echo   설정파일 : %EQUIP_NAME%
echo  ============================================
echo.
echo  Vector를 시작합니다... (이 창을 닫으면 Vector도 종료됩니다)
echo  백그라운드 실행은 install-service.bat으로 서비스 등록을 권장합니다.
echo.

"%VECTOR_EXE%" --config "%TOML_FILE%"

pause
