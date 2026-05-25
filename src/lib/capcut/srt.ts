import type { SubtitleSegment } from "./types";

/**
 * SubtitleSegment[] → .srt 파일 형식 텍스트.
 * 캡컷이 native import 지원.
 *
 * SRT 형식:
 * 1
 * 00:00:00,000 --> 00:00:02,500
 * 안녕하세요
 *
 * 2
 * 00:00:02,500 --> 00:00:05,000
 * 오늘 알려드릴 건...
 */
export function segmentsToSrt(segments: SubtitleSegment[]): string {
  return segments
    .map((seg, i) => {
      return `${i + 1}\n${formatSrtTime(seg.start)} --> ${formatSrtTime(seg.end)}\n${seg.text}`;
    })
    .join("\n\n");
}

function formatSrtTime(seconds: number): string {
  const totalMs = Math.round(seconds * 1000);
  const ms = totalMs % 1000;
  const totalSec = Math.floor(totalMs / 1000);
  const s = totalSec % 60;
  const totalMin = Math.floor(totalSec / 60);
  const m = totalMin % 60;
  const h = Math.floor(totalMin / 60);
  return (
    h.toString().padStart(2, "0") +
    ":" +
    m.toString().padStart(2, "0") +
    ":" +
    s.toString().padStart(2, "0") +
    "," +
    ms.toString().padStart(3, "0")
  );
}

/**
 * 한국어 자막 한 줄을 최대 글자수에 맞게 줄바꿈.
 * 캡컷에서 너무 긴 줄은 화면에서 잘림.
 */
export function wrapSubtitleLine(text: string, maxChars: number = 18): string {
  if (text.length <= maxChars) return text;
  const breakIdx = text.lastIndexOf(" ", maxChars);
  const idx = breakIdx > maxChars / 2 ? breakIdx : maxChars;
  return text.slice(0, idx).trim() + "\n" + text.slice(idx).trim();
}

/**
 * 자막에 한국어 line wrapping 적용 후 .srt 생성.
 */
export function segmentsToSrtWrapped(
  segments: SubtitleSegment[],
  maxChars: number = 18,
): string {
  return segmentsToSrt(
    segments.map((s) => ({ ...s, text: wrapSubtitleLine(s.text, maxChars) })),
  );
}
