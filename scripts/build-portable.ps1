# ARK Clipper Portable Bundle Builder
# Build a standalone portable bundle for distribution

$ErrorActionPreference = "Stop"
$OutputEncoding = [System.Text.Encoding]::UTF8

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$rootParent = Split-Path -Parent $root
$buildDir = Join-Path $rootParent "ARK_Clipper_Portable"
$cacheDir = Join-Path $env:TEMP "ark-portable-cache"
$archiveOut = Join-Path $rootParent "ARK_Clipper_Portable.zip"

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  ARK Clipper - Portable Bundle Builder" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "Output folder: $buildDir" -ForegroundColor White
Write-Host "Output ZIP:    $archiveOut" -ForegroundColor White
Write-Host ""

if (-not (Test-Path $cacheDir)) {
    New-Item -ItemType Directory -Path $cacheDir | Out-Null
}

if (Test-Path $buildDir) {
    Write-Host "Removing existing build folder..." -ForegroundColor Yellow
    Remove-Item $buildDir -Recurse -Force
}
New-Item -ItemType Directory -Path $buildDir | Out-Null

function Download-Cached {
    param($url, $cachePath)
    if (Test-Path $cachePath) {
        Write-Host "  [cached] $cachePath" -ForegroundColor DarkGray
        return
    }
    Write-Host "  Downloading: $url" -ForegroundColor Gray
    Invoke-WebRequest -Uri $url -OutFile $cachePath -UseBasicParsing
}

# === 1. Node.js Portable ===
Write-Host "[1/7] Downloading Node.js portable..." -ForegroundColor Yellow
$nodeVer = "v22.11.0"
$nodeZip = "node-$nodeVer-win-x64.zip"
$nodeZipPath = Join-Path $cacheDir $nodeZip
Download-Cached -url "https://nodejs.org/dist/$nodeVer/$nodeZip" -cachePath $nodeZipPath
Expand-Archive -Path $nodeZipPath -DestinationPath $buildDir -Force
Rename-Item (Join-Path $buildDir "node-$nodeVer-win-x64") (Join-Path $buildDir "node")
Write-Host "  Node.js OK" -ForegroundColor Green

# === 2. FFmpeg Portable ===
Write-Host ""
Write-Host "[2/7] Downloading FFmpeg portable (~80MB)..." -ForegroundColor Yellow
$ffmpegZipPath = Join-Path $cacheDir "ffmpeg.zip"
Download-Cached -url "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip" -cachePath $ffmpegZipPath
Expand-Archive -Path $ffmpegZipPath -DestinationPath (Join-Path $buildDir "ffmpeg-tmp") -Force
$ffmpegInner = Get-ChildItem (Join-Path $buildDir "ffmpeg-tmp") | Where-Object { $_.PSIsContainer } | Select-Object -First 1
Move-Item $ffmpegInner.FullName (Join-Path $buildDir "ffmpeg")
Remove-Item (Join-Path $buildDir "ffmpeg-tmp") -Recurse -Force
Write-Host "  FFmpeg OK" -ForegroundColor Green

# === 3. yt-dlp.exe ===
Write-Host ""
Write-Host "[3/7] Downloading yt-dlp..." -ForegroundColor Yellow
$ytdlpDir = Join-Path $buildDir "bin"
New-Item -ItemType Directory -Path $ytdlpDir -Force | Out-Null
$ytdlpExe = Join-Path $ytdlpDir "yt-dlp.exe"
Invoke-WebRequest -Uri "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe" -OutFile $ytdlpExe
Write-Host "  yt-dlp OK" -ForegroundColor Green

# === 4. Python venv (copy existing) + Whisper model ===
Write-Host ""
Write-Host "[4/7] Copying Python venv + Whisper model..." -ForegroundColor Yellow

$srcVenv = "C:\arc-clipper-venv"
$dstVenv = Join-Path $buildDir "python"

if (-not (Test-Path $srcVenv)) {
    Write-Host "  [ERROR] $srcVenv not found." -ForegroundColor Red
    Write-Host "  Please run install.bat (setup.ps1) first to set up the venv." -ForegroundColor Red
    exit 1
}

Write-Host "  Copying venv..." -ForegroundColor Gray
$null = robocopy $srcVenv $dstVenv /E /NFL /NDL /NJH /NJS /R:1 /W:1
Write-Host "  venv copied." -ForegroundColor Green

Write-Host "  Pre-downloading Whisper large-v3 model (~3GB, may take a while)..." -ForegroundColor Yellow
$venvPython = Join-Path $dstVenv "Scripts\python.exe"
$finalModelDir = Join-Path $buildDir "hf-models"
New-Item -ItemType Directory -Path $finalModelDir -Force | Out-Null

# Download to C: drive first to avoid Korean path issues, then copy to K
$tempModelDir = "C:\hf-temp-models\faster-whisper-large-v3"
if (-not (Test-Path $tempModelDir)) {
    New-Item -ItemType Directory -Path $tempModelDir -Force | Out-Null
}

$env:HF_HUB_DISABLE_SYMLINKS_WARNING = "1"

$preloadFile = Join-Path $env:TEMP "preload_whisper.py"
@"
import os
from huggingface_hub import snapshot_download
target = r'$tempModelDir'
print('Downloading to:', target)
snapshot_download(
    repo_id='Systran/faster-whisper-large-v3',
    local_dir=target,
    local_dir_use_symlinks=False,
)
print('Done.')
"@ | Out-File -FilePath $preloadFile -Encoding ascii

& $venvPython $preloadFile
$modelDownloaded = ($LASTEXITCODE -eq 0)
Remove-Item $preloadFile -ErrorAction SilentlyContinue

if ($modelDownloaded) {
    Write-Host "  Copying model to portable bundle..." -ForegroundColor Gray
    $finalModelPath = Join-Path $finalModelDir "faster-whisper-large-v3"
    $null = robocopy $tempModelDir $finalModelPath /E /NFL /NDL /NJH /NJS /R:1 /W:1
    Write-Host "  Whisper model OK" -ForegroundColor Green
} else {
    Write-Host "  [WARN] Whisper model download had issues. Will be downloaded on first run." -ForegroundColor Yellow
}

# === 5. Next.js: skip production build (Korean path + K-drive issues), use dev mode ===
Write-Host ""
Write-Host "[5/7] Skipping production build (will use dev mode in portable)..." -ForegroundColor Yellow
Write-Host "  Note: dev mode is slightly slower on first request but works reliably." -ForegroundColor Gray

# === 6. Copy app files ===
Write-Host ""
Write-Host "[6/7] Copying app files..." -ForegroundColor Yellow
$appDir = Join-Path $buildDir "app"
$null = robocopy $root $appDir /E /XD node_modules .next workspace data ARK_Clipper_Portable /XF .env.local .env *.log tsconfig.tsbuildinfo /NFL /NDL /NJH /NJS /R:1 /W:1
$null = robocopy (Join-Path $root "node_modules") (Join-Path $appDir "node_modules") /E /NFL /NDL /NJH /NJS /R:1 /W:1
Write-Host "  App files copied." -ForegroundColor Green

# === 7. Generate start.bat and readme ===
Write-Host ""
Write-Host "[7/7] Generating start scripts..." -ForegroundColor Yellow

$startBatPath = Join-Path $buildDir "start.bat"
@'
@echo off
chcp 65001 >nul
setlocal

cd /d "%~dp0"

set ARC_PORTABLE_ROOT=%~dp0
set ARC_PYTHON_EXE=%~dp0python\Scripts\python.exe
set ARC_YTDLP=%~dp0bin\yt-dlp.exe
set HF_HOME=%~dp0hf-cache
set TRANSFORMERS_CACHE=%~dp0hf-cache

set PATH=%~dp0node;%~dp0ffmpeg\bin;%PATH%

set ANTHROPIC_API_KEY=

start "" /MIN cmd /c "timeout /t 5 /nobreak >nul && start http://localhost:3000"

echo.
echo ============================================
echo   ARK Clipper starting... (please wait)
echo ============================================
echo.
echo Browser will open in 5 seconds.
echo To exit: press Ctrl+C in this window.
echo.

cd /d "%~dp0app"
"%~dp0node\node.exe" "%~dp0app\node_modules\next\dist\bin\next" dev --webpack

pause
'@ | Out-File $startBatPath -Encoding ascii


$readmeBytes = [System.Text.Encoding]::UTF8.GetBytes(@'
=========================================
  ARK Clipper Portable - 사용법
=========================================

[설치 X] 별도 설치 필요 없습니다. 압축만 풀면 됩니다.

▶ 실행
   start.bat 더블클릭

▶ 처음 사용 시
   1. start.bat 더블클릭
   2. 잠시 후 브라우저가 자동으로 열림 (http://localhost:3000)
   3. 우상단 "Anthropic API 키" 입력 (1회)
      - 발급: https://console.anthropic.com/settings/keys
      - 비용: 영상 1개 분석에 약 $0.05 ~ $0.20
   4. YouTube URL 붙여넣기 -> 사용 시작!

▶ 종료
   검은 창에서 Ctrl+C 또는 창 닫기

▶ 영상 저장 위치
   기본: 이 폴더 안의 workspace\
   변경: 홈 화면 "저장 폴더" 설정에서 절대 경로 입력 가능

▶ 시스템 요구사항
   - Windows 10/11 (64bit)
   - NVIDIA GPU 권장 (없으면 음성 인식 매우 느림)
   - 인터넷 연결 (영상 다운로드 + AI 분석)

▶ 문제 해결
   - 검은 창의 빨간색 메시지 확인
   - 다시 start.bat 실행
'@)
$readmePath = Join-Path $buildDir "README.txt"
[System.IO.File]::WriteAllBytes($readmePath, $readmeBytes)

Write-Host "  Scripts + readme OK" -ForegroundColor Green

# === Optional ZIP ===
Write-Host ""
Write-Host "Compressing to ZIP..." -ForegroundColor Yellow
$compressYn = Read-Host "Create ZIP file? (Y/N, default Y)"
if ($compressYn -ne "N" -and $compressYn -ne "n") {
    if (Test-Path $archiveOut) { Remove-Item $archiveOut -Force }
    Write-Host "  Compressing (10-30 min)..." -ForegroundColor Yellow
    Compress-Archive -Path "$buildDir\*" -DestinationPath $archiveOut -CompressionLevel Optimal
    $size = (Get-Item $archiveOut).Length / 1GB
    Write-Host "  ZIP: $archiveOut ($([math]::Round($size, 2)) GB)" -ForegroundColor Green
}

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  Build complete!" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "How to share:" -ForegroundColor White
Write-Host "  1. Send ARK_Clipper_Portable.zip (or folder) to colleagues" -ForegroundColor White
Write-Host "  2. Recipient: unzip -> double-click start.bat" -ForegroundColor White
Write-Host "  3. Recipient enters their own Anthropic API key" -ForegroundColor White
Write-Host ""
