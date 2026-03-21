@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul 2>&1
:: =============================================================================
::  Vector Agent - Windows 서비스 등록 스크립트
:: =============================================================================
::  Vector의 내장 서비스 명령어(vector service install)를 사용하여
::  Windows 서비스로 등록합니다.
::
::  사용법:
::    1. 이 폴더에 설비별 .toml 설정 파일을 넣어주세요
::    2. 이 파일을 우클릭 → "관리자 권한으로 실행"
::
::  참고: 관리자 권한이 반드시 필요합니다.
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

:: 현재 디렉토리 기준 경로 설정
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

:: TOML 파일 자동 감지 (현재 디렉토리의 *.toml)
set "TOML_FILE="
set "TOML_COUNT=0"
for %%f in ("%VECTOR_DIR%*.toml") do (
    set "TOML_FILE=%%f"
    set /a TOML_COUNT+=1
)

if "%TOML_FILE%"=="" (
    echo.
    echo  [오류] TOML 설정 파일을 찾을 수 없습니다.
    echo  이 폴더에 설비별 .toml 파일을 넣어주세요.
    echo  (예: AOI.toml, SPI.toml 등)
    echo.
    pause
    exit /b 1
)

:: 여러 TOML 파일이 있으면 선택
if %TOML_COUNT% gtr 1 (
    echo.
    echo  여러 TOML 파일이 발견되었습니다:
    echo.
    set "IDX=0"
    for %%f in ("%VECTOR_DIR%*.toml") do (
        set /a IDX+=1
        echo    [!IDX!] %%~nxf
    )
    echo.
    set /p "CHOICE=  사용할 파일 번호를 입력하세요: "
    set "IDX=0"
    for %%f in ("%VECTOR_DIR%*.toml") do (
        set /a IDX+=1
        if "!IDX!"=="!CHOICE!" set "TOML_FILE=%%f"
    )
)

:: 서비스명 설정 (TOML 파일명 기반)
for %%f in ("%TOML_FILE%") do set "EQUIP_NAME=%%~nf"
set "SERVICE_NAME=VectorAgent_%EQUIP_NAME%"

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
echo   Vector Agent 서비스 등록
echo  ============================================
echo   실행파일 : %VECTOR_EXE%
echo   설정파일 : %TOML_FILE%
echo   서비스명 : %SERVICE_NAME%
echo  ============================================
echo.

:: 기존 동일 이름 서비스가 있으면 중지 후 제거
sc query "%SERVICE_NAME%" >nul 2>&1
if %errorlevel% equ 0 (
    echo  기존 서비스를 중지하고 제거합니다...
    "%VECTOR_EXE%" service stop --name "%SERVICE_NAME%" >nul 2>&1
    timeout /t 2 /nobreak >nul
    "%VECTOR_EXE%" service uninstall --name "%SERVICE_NAME%" >nul 2>&1
    timeout /t 2 /nobreak >nul
)

:: Vector 내장 명령어로 서비스 등록
echo  서비스를 등록합니다...
"%VECTOR_EXE%" service install --name "%SERVICE_NAME%" --display-name "Vector Agent (%EQUIP_NAME%)" --config-toml "%TOML_FILE%"

if %errorlevel% neq 0 (
    echo.
    echo  [실패] 서비스 등록에 실패했습니다.
    echo.
    pause
    exit /b 1
)

:: 서비스 복구 옵션 설정 (실패 시 자동 재시작)
sc failure "%SERVICE_NAME%" reset= 86400 actions= restart/5000/restart/10000/restart/30000 >nul 2>&1

echo.
echo  [성공] 서비스가 등록되었습니다!
echo.
echo  - 서비스명    : %SERVICE_NAME%
echo  - 시작 유형   : 자동 (시스템 시작 시 실행)
echo  - 복구 정책   : 실패 시 자동 재시작 (5초/10초/30초)
echo.
echo  지금 바로 서비스를 시작하시겠습니까?
set /p "START_NOW=  (Y/N): "
if /i "%START_NOW%"=="Y" (
    "%VECTOR_EXE%" service start --name "%SERVICE_NAME%"
    if !errorlevel! equ 0 (
        echo.
        echo  [성공] 서비스가 시작되었습니다.
    ) else (
        echo.
        echo  [알림] 서비스 시작에 실패했습니다.
        echo  services.msc 에서 상태를 확인하세요.
    )
)
echo.
echo  - 서비스 관리 : services.msc 에서 "%SERVICE_NAME%" 확인
echo  - 서비스 제거 : uninstall-service.bat 실행
echo.

pause
