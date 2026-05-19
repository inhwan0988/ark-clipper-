# ARK Clipper 공유용 ZIP 만들기
# 동료에게 보낼 압축 파일 생성 (개인 정보 제외)
#
# 사용법: PowerShell에서 .\scripts\공유용_압축.ps1 실행
#         또는 우클릭 → "PowerShell로 실행"

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$timestamp = Get-Date -Format "yyyyMMdd-HHmm"
$outputName = "ARK_Clipper_$timestamp.zip"
$outputPath = Join-Path $root.Parent.FullName $outputName

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  ARK Clipper - 공유용 압축 파일 생성" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# 압축에서 제외할 폴더/파일 (개인 정보, 무거운 임시 파일)
$excludePatterns = @(
    "node_modules",
    ".next",
    "workspace",
    "data",
    ".env.local",
    ".env",
    "*.log",
    "tsconfig.tsbuildinfo"
)

# 임시 폴더에 복사 후 압축
$stagingDir = Join-Path $env:TEMP "ARK_Clipper_staging_$timestamp"
if (Test-Path $stagingDir) { Remove-Item $stagingDir -Recurse -Force }
New-Item -ItemType Directory -Path $stagingDir | Out-Null

Write-Host "[1/3] 파일 복사 중..." -ForegroundColor Yellow

# robocopy로 빠른 복사 + 제외
$excludeArgs = $excludePatterns | ForEach-Object { "/XD", $_, "/XF", $_ } | Out-String -Stream
$null = & robocopy $root $stagingDir /E /XD node_modules .next workspace data /XF .env.local .env *.log tsconfig.tsbuildinfo /NFL /NDL /NJH /NJS

Write-Host "[2/3] 압축 중..." -ForegroundColor Yellow
if (Test-Path $outputPath) { Remove-Item $outputPath -Force }
Compress-Archive -Path "$stagingDir\*" -DestinationPath $outputPath -CompressionLevel Optimal

Write-Host "[3/3] 임시 폴더 정리..." -ForegroundColor Yellow
Remove-Item $stagingDir -Recurse -Force

$size = (Get-Item $outputPath).Length / 1MB
Write-Host ""
Write-Host "✓ 완료!" -ForegroundColor Green
Write-Host "  파일: $outputPath" -ForegroundColor White
Write-Host "  크기: $([math]::Round($size, 1)) MB" -ForegroundColor White
Write-Host ""
Write-Host "동료에게 전달할 때 안내:" -ForegroundColor Cyan
Write-Host "  1. 압축 풀기" -ForegroundColor White
Write-Host "  2. install.bat 더블클릭 (1회)" -ForegroundColor White
Write-Host "  3. start.bat 더블클릭 (실행할 때마다)" -ForegroundColor White
Write-Host "  4. 본인 Anthropic API 키 발급 후 홈에서 입력" -ForegroundColor White
Write-Host ""
