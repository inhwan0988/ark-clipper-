@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

REM ========================================
REM ARK Clipper 1회 설치 스크립트
REM (Windows: 더블클릭하면 자동 실행)
REM ========================================

cd /d "%~dp0"

echo.
echo ============================================
echo   ARK Clipper - 첫 설치 (시간이 걸립니다)
echo ============================================
echo.

REM 관리자 권한 안내 (winget이 필요할 수 있음)
echo 설치 중 보안 경고가 뜨면 "예/허용"을 선택해주세요.
echo.
pause

REM PowerShell 실행 정책 임시 우회
powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0scripts\setup.ps1"

if errorlevel 1 (
    echo.
    echo [!] 설치 중 오류가 발생했습니다.
    echo     위 빨간색 메시지를 확인해주세요.
    echo.
    pause
    exit /b 1
)

echo.
echo ============================================
echo   설치 완료!
echo ============================================
echo.
echo 다음 단계:
echo  1. start.bat 을 더블클릭해서 ARK Clipper 실행
echo  2. 브라우저가 자동으로 열립니다
echo  3. 우상단 API 키 입력 (https://console.anthropic.com)
echo.
pause
