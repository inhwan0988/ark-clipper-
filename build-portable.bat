@echo off
chcp 65001 >nul

REM ARK Clipper 휴대용 번들 빌드 (1회 실행)
REM 출력: ../ARK_Clipper_Portable/ + ../ARK_Clipper_Portable.zip
REM 시간: 30분~1시간, 다운로드 약 4GB

cd /d "%~dp0"

echo.
echo ============================================
echo   ARK Clipper 휴대용 번들 빌드
echo ============================================
echo.
echo 이 작업은:
echo  - Node.js, FFmpeg, yt-dlp 다운로드
echo  - Whisper 모델 다운로드 (~3GB)
echo  - Next.js 프로덕션 빌드
echo  - 모든 파일을 ARK_Clipper_Portable/ 에 복사
echo  - ZIP으로 압축 (선택)
echo.
echo 사전 조건:
echo  - install.bat 으로 setup.ps1 한 번 이미 실행했어야 함
echo    (C:\arc-clipper-venv 폴더 + faster-whisper 설치되어 있어야)
echo.
pause

powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0scripts\build-portable.ps1"

if errorlevel 1 (
    echo.
    echo [!] 빌드 실패. 위 메시지 확인.
    pause
    exit /b 1
)

echo.
echo 빌드 완료! 동료에게 ARK_Clipper_Portable.zip 전달하세요.
pause
