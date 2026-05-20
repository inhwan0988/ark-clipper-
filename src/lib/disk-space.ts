import { statfsSync } from 'fs';

/**
 * 디스크 여유 공간 체크 (MB 단위).
 * Node v18.15+ 의 fs.statfsSync 사용. 외부 deps 없음.
 *
 * 사용처: 영상 다운로드 전 사전 체크.
 * 1시간 1080p mp4 ≈ 500MB, Whisper 전용 wav ≈ 1GB.
 * 클립 6개 추가 합 1GB → 안전 마진 5GB 권장.
 */
export function getFreeDiskSpaceMB(dir: string): number {
  try {
    const stat = statfsSync(dir);
    // bfree는 bigint일 수 있음 (큰 디스크). Number 변환.
    return (Number(stat.bfree) * stat.bsize) / (1024 * 1024);
  } catch {
    return -1; // 측정 실패 (권한 부족 또는 OS 미지원)
  }
}

export function checkDiskSpace(
  dir: string,
  requiredMB: number = 5000,
): { ok: boolean; freeMB: number; message?: string } {
  const freeMB = getFreeDiskSpaceMB(dir);
  if (freeMB < 0) {
    // 측정 못 하면 통과 (false negative 회피)
    return { ok: true, freeMB };
  }
  if (freeMB < requiredMB) {
    return {
      ok: false,
      freeMB,
      message:
        `저장 폴더의 여유 공간이 약 ${freeMB.toFixed(0)}MB로 부족합니다 ` +
        `(최소 ${requiredMB}MB 권장).\n` +
        '다른 폴더를 선택하거나 디스크를 정리한 뒤 다시 시도해주세요.',
    };
  }
  return { ok: true, freeMB };
}
