@echo off
chcp 65001 >nul
setlocal

REM ========================================
REM ARK Clipper 실행
REM (Windows: 더블클릭하면 자동 실행 + 브라우저 열림)
REM ========================================

cd /d "%~dp0"

REM Node.js 확인
where node >nul 2>nul
if errorlevel 1 (
    echo [!] Node.js가 설치되어 있지 않습니다.
    echo     install.bat 을 먼저 실행해주세요.
    echo.
    pause
    exit /b 1
)

REM node_modules 확인
if not exist "node_modules\next" (
    echo [!] 패키지가 설치되어 있지 않습니다.
    echo     install.bat 을 먼저 실행해주세요.
    echo.
    pause
    exit /b 1
)

REM 환경변수 ANTHROPIC_API_KEY가 빈 문자열로 설정된 경우 제거
REM (홈 화면에서 입력한 API 키가 우선 적용되도록)
set ANTHROPIC_API_KEY=

REM 브라우저 자동으로 열기 (5초 후)
start "" /MIN cmd /c "timeout /t 5 /nobreak >nul && start http://localhost:3000"

echo.
echo ============================================
echo   ARK Clipper 시작 중...
echo ============================================
echo.
echo 잠시 후 브라우저가 자동으로 열립니다.
echo 종료하려면 이 창에서 Ctrl+C 누르세요.
echo.

REM Next.js dev 서버 시작
call npm run dev

pause
