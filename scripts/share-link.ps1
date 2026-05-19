# ARK Clipper - Public URL Tunnel (Cloudflare)
#
# 이 스크립트는:
#  1. 본인 PC의 ARK Clipper 서버를 인터넷에 임시로 노출
#  2. 누구나 접속 가능한 URL 발급 (https://xxx.trycloudflare.com)
#  3. 서버는 본인 PC에서 계속 돌아야 함 (start.bat 켜놓아야 함)
#
# 보안 주의:
#  - 발급된 URL을 받은 사람은 누구나 접속 가능
#  - 영상/파일은 호스트 PC에 저장됨
#  - 각 사용자는 본인 브라우저에 자신의 API 키 입력해서 사용
#  - Cloudflare URL은 매번 바뀌고 영구적이지 않음

$ErrorActionPreference = "Stop"

$cloudflaredDir = Join-Path $PSScriptRoot "..\bin"
$cloudflaredExe = Join-Path $cloudflaredDir "cloudflared.exe"

if (-not (Test-Path $cloudflaredDir)) {
    New-Item -ItemType Directory -Path $cloudflaredDir | Out-Null
}

# cloudflared 자동 다운로드
if (-not (Test-Path $cloudflaredExe)) {
    Write-Host "cloudflared 다운로드 중 (~25MB)..." -ForegroundColor Yellow
    $url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
    Invoke-WebRequest -Uri $url -OutFile $cloudflaredExe -UseBasicParsing
    Write-Host "다운로드 완료." -ForegroundColor Green
}

# 로컬 서버 확인
Write-Host ""
Write-Host "로컬 서버(http://localhost:3000) 확인 중..." -ForegroundColor Yellow
try {
    $null = Invoke-WebRequest -Uri "http://localhost:3000" -UseBasicParsing -TimeoutSec 3
    Write-Host "  서버 정상 동작 중." -ForegroundColor Green
} catch {
    Write-Host "  [!] 서버가 응답하지 않습니다." -ForegroundColor Red
    Write-Host "  먼저 start.bat 으로 ARK Clipper를 실행해주세요." -ForegroundColor Red
    Write-Host ""
    Read-Host "엔터를 누르면 종료"
    exit 1
}

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  ARK Clipper - 공유 링크 시작 중" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "잠시 후 화면에 공유 URL이 표시됩니다." -ForegroundColor White
Write-Host "예: https://random-words-1234.trycloudflare.com" -ForegroundColor Gray
Write-Host ""
Write-Host "그 URL을 동료에게 전달하면 누구나 접속 가능합니다." -ForegroundColor White
Write-Host ""
Write-Host "주의:" -ForegroundColor Yellow
Write-Host "  - 이 창을 닫으면 URL이 작동을 멈춥니다" -ForegroundColor Yellow
Write-Host "  - start.bat 도 켜져 있어야 합니다" -ForegroundColor Yellow
Write-Host "  - 종료: 이 창에서 Ctrl+C" -ForegroundColor Yellow
Write-Host ""
Write-Host "--------------------------------------------------" -ForegroundColor DarkGray

# Cloudflare Quick Tunnel 시작 (계정 불필요)
& $cloudflaredExe tunnel --url http://localhost:3000

Write-Host ""
Write-Host "터널이 종료되었습니다."
Read-Host "엔터를 누르면 창 닫기"
