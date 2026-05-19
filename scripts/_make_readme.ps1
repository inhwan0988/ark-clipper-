$content = @'
=========================================
  ARK Clipper Portable - 사용법
=========================================

[설치 X] 별도 설치 필요 없습니다. 압축만 풀면 됩니다.

▶ 실행
   start.bat 더블클릭

▶ 처음 사용 시
   1. start.bat 더블클릭
   2. 잠시 후 브라우저가 자동으로 열림 (http://localhost:3000)
   3. 우상단 'Anthropic API 키' 입력 (1회)
      - 발급: https://console.anthropic.com/settings/keys
      - 비용: 영상 1개 분석에 약 0.05 ~ 0.20 USD
   4. YouTube URL 붙여넣기 → 사용 시작!

▶ 종료
   검은 창에서 Ctrl+C 또는 창 닫기

▶ 영상 저장 위치
   기본: 이 폴더 안의 workspace\
   변경: 홈 화면 '저장 폴더' 설정에서 절대 경로 입력 가능

▶ 시스템 요구사항
   - Windows 10/11 (64bit)
   - NVIDIA GPU 권장 (없으면 음성 인식 매우 느림)
   - 인터넷 연결 (영상 다운로드 + AI 분석)

▶ 문제 해결
   - 검은 창의 빨간색 메시지 확인
   - 다시 start.bat 실행
'@

$bytes = [System.Text.Encoding]::UTF8.GetBytes($content)
$path = "K:\아크스튜디오\ARK_Clipper_Portable\README.txt"
[System.IO.File]::WriteAllBytes($path, $bytes)
Write-Host "README.txt created at $path"
