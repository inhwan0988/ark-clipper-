import type { SilenceSegment, SubtitleSegment } from "./types";

/**
 * Whisper segment 사이의 gap으로 무음 구간 추론.
 *
 * Vercel function 환경에서는 ffmpeg native silenceremove 사용이 어려움
 * (binary 권한 + timeout). 대신 Whisper의 정확한 timestamp를 활용해
 * "사람 말이 없는 구간" = 무음 구간으로 처리.
 *
 * @param segments Whisper transcribe 결과
 * @param totalDuration 전체 audio 길이 (초)
 * @param minSilenceSec 잘라낼 최소 무음 길이 (기본 0.5초)
 */
export function detectSilences(
  segments: SubtitleSegment[],
  totalDuration: number,
  minSilenceSec: number = 0.5,
): SilenceSegment[] {
  if (segments.length === 0) {
    return [
      {
        start: 0,
        end: totalDuration,
        duration: totalDuration,
        type: "middle",
      },
    ];
  }

  const result: SilenceSegment[] = [];

  // Leading silence — 영상 시작 ~ 첫 자막
  const firstStart = segments[0].start;
  if (firstStart >= minSilenceSec) {
    result.push({
      start: 0,
      end: firstStart,
      duration: firstStart,
      type: "leading",
    });
  }

  // Middle silences — 자막 사이 gap
  for (let i = 0; i < segments.length - 1; i++) {
    const gapStart = segments[i].end;
    const gapEnd = segments[i + 1].start;
    const gap = gapEnd - gapStart;
    if (gap >= minSilenceSec) {
      result.push({
        start: gapStart,
        end: gapEnd,
        duration: gap,
        type: "middle",
      });
    }
  }

  // Trailing silence — 마지막 자막 ~ 영상 끝
  const lastEnd = segments[segments.length - 1].end;
  const trailingGap = totalDuration - lastEnd;
  if (trailingGap >= minSilenceSec) {
    result.push({
      start: lastEnd,
      end: totalDuration,
      duration: trailingGap,
      type: "trailing",
    });
  }

  return result;
}

/**
 * 무음 구간 제거 후의 총 시간 계산.
 */
export function calculateTrimmedDuration(
  totalDuration: number,
  silences: SilenceSegment[],
): number {
  const silenceTotal = silences.reduce((sum, s) => sum + s.duration, 0);
  return Math.max(0, totalDuration - silenceTotal);
}
