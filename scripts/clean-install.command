#!/bin/bash
# Ark Clipper 완전 삭제 + 최신 버전 다운로드 (macOS)
# 사용법: 이 파일을 더블클릭 (Gatekeeper 경고 뜨면 우클릭 → 열기 → 그래도 열기)

set -e

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  🧹 Ark Clipper 완전 삭제 + 재설치       ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# 1) 실행 중이면 종료
echo "[1/5] Ark Clipper 종료 중..."
osascript -e 'tell application "Ark Clipper" to quit' 2>/dev/null || true
pkill -f "Ark Clipper" 2>/dev/null || true
sleep 1

# 2) 앱 본체 삭제
echo "[2/5] 앱 본체 삭제..."
if [ -d "/Applications/Ark Clipper.app" ]; then
  rm -rf "/Applications/Ark Clipper.app"
  echo "      ✓ /Applications/Ark Clipper.app 삭제됨"
else
  echo "      (이미 없음)"
fi

# 3) 사용자 데이터 / 캐시 / 설정 삭제
echo "[3/5] 사용자 데이터 / 설정 / 캐시 삭제..."
rm -rf "$HOME/Library/Application Support/Ark Clipper" 2>/dev/null && echo "      ✓ Application Support" || true
rm -rf "$HOME/Library/Caches/com.arkstudio.arkclipper" 2>/dev/null && echo "      ✓ Caches" || true
rm -rf "$HOME/Library/Logs/Ark Clipper" 2>/dev/null && echo "      ✓ Logs" || true
rm -f  "$HOME/Library/Preferences/com.arkstudio.arkclipper.plist" 2>/dev/null && echo "      ✓ Preferences" || true
rm -rf "$HOME/Library/Saved Application State/com.arkstudio.arkclipper.savedState" 2>/dev/null && echo "      ✓ Saved Application State" || true

# 4) macOS Gatekeeper 캐시 (quarantine attribute) — 새 dmg 받을 때 "손상" 우회용
echo "[4/5] Launch Services 캐시 갱신..."
/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister -kill -r -domain local -domain user 2>/dev/null || true

# 5) 최신 release 페이지 열기
echo "[5/5] 최신 버전 페이지 열기..."
open "https://github.com/inhwan0988/ark-clipper-/releases/latest"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  ✅ 완료!                                  ║"
echo "║                                          ║"
echo "║  다음 단계:                              ║"
echo "║  1. 열린 페이지에서 dmg 다운로드          ║"
echo "║     • M1/M2/M3 Mac:  *-arm64.dmg         ║"
echo "║     • Intel Mac:     *(arm64 없는) .dmg  ║"
echo "║  2. dmg 열어서 응용 프로그램으로 드래그   ║"
echo "║  3. 새 앱 실행 → API 키 다시 입력         ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "이 창은 5초 후 자동으로 닫힙니다..."
sleep 5
