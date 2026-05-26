@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title Ark Clipper 완전 삭제 + 재설치
color 0B

echo.
echo ╔══════════════════════════════════════════╗
echo ║  🧹 Ark Clipper 완전 삭제 + 재설치       ║
echo ╚══════════════════════════════════════════╝
echo.

REM 1) 실행 중이면 종료
echo [1/5] Ark Clipper 종료 중...
taskkill /F /IM "Ark Clipper.exe" /T >nul 2>&1
taskkill /F /IM "ArkClipper.exe" /T >nul 2>&1
timeout /t 2 /nobreak >nul

REM 2) 공식 uninstaller 자동 실행 (HKCU + HKLM 둘 다 시도)
echo [2/5] 공식 uninstaller 자동 실행 시도...
set UNINST=
for /f "tokens=2,*" %%a in ('reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\b1bff0a9-3a3c-5b13-9c8c-ark-clipper" /v "UninstallString" 2^>nul') do set "UNINST=%%b"
if not defined UNINST (
  for /f "tokens=2,*" %%a in ('reg query "HKLM\Software\Microsoft\Windows\CurrentVersion\Uninstall\b1bff0a9-3a3c-5b13-9c8c-ark-clipper" /v "UninstallString" 2^>nul') do set "UNINST=%%b"
)
REM 키 이름이 다를 수 있으니 displayName으로도 검색
if not defined UNINST (
  for /f "tokens=*" %%k in ('reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall" /s /f "Ark Clipper" 2^>nul ^| findstr /B "HKEY"') do (
    for /f "tokens=2,*" %%a in ('reg query "%%k" /v "UninstallString" 2^>nul') do set "UNINST=%%b"
  )
)
if defined UNINST (
  echo       ✓ uninstaller 발견: !UNINST!
  start /WAIT "" !UNINST! /S
  echo       ✓ silent uninstall 완료
) else (
  echo       (uninstaller 자동 검출 실패 — 데이터만 정리합니다)
)

REM 3) 사용자 데이터 / 캐시 / 설정 삭제
echo [3/5] 사용자 데이터 / 설정 / 캐시 삭제...
rd /s /q "%ProgramData%\ArkClipper" 2>nul && echo       ✓ %%ProgramData%%\ArkClipper
rd /s /q "%APPDATA%\Ark Clipper" 2>nul && echo       ✓ %%APPDATA%%\Ark Clipper
rd /s /q "%LOCALAPPDATA%\Ark Clipper" 2>nul && echo       ✓ %%LOCALAPPDATA%%\Ark Clipper
rd /s /q "%LOCALAPPDATA%\Programs\ark-clipper" 2>nul && echo       ✓ Programs\ark-clipper
rd /s /q "%LOCALAPPDATA%\Programs\Ark Clipper" 2>nul && echo       ✓ Programs\Ark Clipper

REM 4) 시작 메뉴 단축어
echo [4/5] 시작 메뉴 단축어 정리...
del /F /Q "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Ark Clipper.lnk" 2>nul
rd /s /q "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Ark Clipper" 2>nul

REM 5) 최신 release 페이지 열기
echo [5/5] 최신 버전 페이지 열기...
start "" "https://github.com/inhwan0988/ark-clipper-/releases/latest"

echo.
echo ╔══════════════════════════════════════════╗
echo ║  ✅ 완료!                                  ║
echo ║                                          ║
echo ║  다음 단계:                              ║
echo ║  1. 열린 페이지에서 exe 다운로드          ║
echo ║     Ark-Clipper-Setup-X.X.X.exe         ║
echo ║  2. exe 실행 → 설치                       ║
echo ║  3. 새 앱 실행 → API 키 다시 입력         ║
echo ╚══════════════════════════════════════════╝
echo.
echo 아무 키나 누르면 이 창이 닫힙니다...
pause >nul
