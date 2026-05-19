# ARK Clipper 설치 스크립트
# install.bat 에서 자동 호출됩니다.

$ErrorActionPreference = "Stop"

Write-Host "=== ARK Clipper 설치 시작 ===" -ForegroundColor Cyan

$root = Resolve-Path (Join-Path $PSScriptRoot "..")

# === 1. Node.js 확인 ===
Write-Host "`n[1/6] Node.js 확인..." -ForegroundColor Yellow
$nodeVersion = node --version 2>$null
if ($nodeVersion) {
    Write-Host "  Node.js $nodeVersion 설치됨" -ForegroundColor Green
} else {
    Write-Host "  Node.js가 설치되어 있지 않습니다." -ForegroundColor Red
    Write-Host "  https://nodejs.org 에서 LTS 버전 설치 후 다시 실행해주세요." -ForegroundColor Red
    exit 1
}

# === 2. FFmpeg 확인 ===
Write-Host "`n[2/6] FFmpeg 확인..." -ForegroundColor Yellow
try {
    $null = ffmpeg -version 2>$null
    Write-Host "  FFmpeg 설치됨" -ForegroundColor Green
} catch {
    Write-Host "  FFmpeg가 설치되어 있지 않습니다." -ForegroundColor Red
    Write-Host "  PowerShell 관리자 권한으로:  winget install Gyan.FFmpeg" -ForegroundColor Red
    Write-Host "  설치 후 컴퓨터 재시작/재로그인 필요." -ForegroundColor Red
    exit 1
}

# === 3. Python 확인 / 설치 ===
Write-Host "`n[3/6] Python 확인..." -ForegroundColor Yellow
$pythonExe = $null
foreach ($cmd in @("python", "python3")) {
    try {
        $ver = & $cmd --version 2>&1
        if ($ver -match "Python 3\.(1[0-3]|9)") {
            # python.exe 풀 경로 획득
            $pythonExe = (Get-Command $cmd).Source
            Write-Host "  $ver 설치됨 ($pythonExe)" -ForegroundColor Green
            break
        }
    } catch {}
}

if (-not $pythonExe) {
    Write-Host "  Python 3 설치 중 (winget)..." -ForegroundColor Yellow
    winget install Python.Python.3.12 --silent --accept-source-agreements --accept-package-agreements
    Write-Host "`n  Python 설치 완료. 새 PowerShell 창에서 install.bat 다시 실행해주세요." -ForegroundColor Yellow
    exit 0
}

# === 4. Python 가상환경 + faster-whisper ===
Write-Host "`n[4/6] Python 가상환경 + faster-whisper 설치..." -ForegroundColor Yellow

# 한글/공백 경로 권한 문제 회피 위해 C 드라이브에 venv 생성
$venvRoot = "C:\arc-clipper-venv"
$venvPython = Join-Path $venvRoot "Scripts\python.exe"

if (-not (Test-Path $venvPython)) {
    Write-Host "  가상환경 생성 중: $venvRoot" -ForegroundColor Yellow
    & $pythonExe -m venv $venvRoot
}

if (-not (Test-Path $venvPython)) {
    Write-Host "  가상환경 생성 실패!" -ForegroundColor Red
    exit 1
}
Write-Host "  가상환경 OK" -ForegroundColor Green

Write-Host "  faster-whisper 설치 (5~10분 소요)..." -ForegroundColor Yellow
& $venvPython -m pip install --quiet faster-whisper
if ($LASTEXITCODE -ne 0) {
    Write-Host "  faster-whisper 설치 실패" -ForegroundColor Red
    exit 1
}

Write-Host "  CUDA 라이브러리 설치 (GPU 가속용)..." -ForegroundColor Yellow
& $venvPython -m pip install --quiet nvidia-cublas-cu12 nvidia-cudnn-cu12
if ($LASTEXITCODE -ne 0) {
    Write-Host "  [경고] CUDA 라이브러리 설치 실패. CPU로 동작 (느림)" -ForegroundColor Yellow
}
Write-Host "  Python 패키지 설치 완료" -ForegroundColor Green

# === 5. yt-dlp 다운로드 ===
Write-Host "`n[5/6] yt-dlp 다운로드..." -ForegroundColor Yellow
$ytdlpPath = Join-Path $root "bin\yt-dlp.exe"
if (-not (Test-Path (Split-Path $ytdlpPath))) {
    New-Item -ItemType Directory -Path (Split-Path $ytdlpPath) -Force | Out-Null
}
if (-not (Test-Path $ytdlpPath)) {
    $url = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"
    Invoke-WebRequest -Uri $url -OutFile $ytdlpPath
    Write-Host "  yt-dlp 다운로드 완료" -ForegroundColor Green
} else {
    Write-Host "  yt-dlp 이미 존재" -ForegroundColor Green
}

# === 6. npm 패키지 설치 ===
Write-Host "`n[6/6] npm 패키지 설치 (5~10분 소요)..." -ForegroundColor Yellow
Push-Location $root
npm install --legacy-peer-deps --silent
$npmExit = $LASTEXITCODE
Pop-Location
if ($npmExit -ne 0) {
    Write-Host "  npm 설치 실패. 'npm install --legacy-peer-deps' 수동 실행해보세요." -ForegroundColor Red
    exit 1
}
Write-Host "  npm 패키지 설치 완료" -ForegroundColor Green

Write-Host "`n=== 설치 완료! ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "이제 start.bat 을 더블클릭해서 실행하세요." -ForegroundColor White
Write-Host "브라우저가 자동으로 열립니다 (http://localhost:3000)" -ForegroundColor White
Write-Host ""
Write-Host "Anthropic API 키 발급:" -ForegroundColor Yellow
Write-Host "  https://console.anthropic.com/settings/keys" -ForegroundColor White
Write-Host "  발급 후 홈 화면 우상단에 입력 (한 번만)" -ForegroundColor White
