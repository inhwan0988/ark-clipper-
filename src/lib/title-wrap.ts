/**
 * 제목/채널명 등 burn-in 텍스트의 줄바꿈 로직.
 * 미리보기(React DOM)와 실제 mp4 출력(ffmpeg drawtext) 양쪽에서 동일하게 사용해
 * 사용자가 본 줄바꿈과 실제 출력의 줄바꿈을 보장한다.
 */

/** 텍스트의 시각적 너비 — 한글/전각=1.0, 공백=0.4, 영문/기타=0.55 */
export function visualWidthUnits(s: string): number {
  let w = 0;
  for (const ch of s) {
    if (ch === ' ') w += 0.4;
    else if (/[ㄱ-ㆎ가-힣一-鿿぀-ヿ]/.test(ch)) w += 1.0;
    else w += 0.55;
  }
  return w;
}

/**
 * 한글 친화 줄바꿈.
 * maxUnits = boxWidth / fontSize (한 줄에 들어가는 visualWidth 단위).
 * 단어/공백 단위로 끊고, 안 되면 글자 단위로 강제 break.
 */
export function splitTitleLines(text: string, maxUnits: number): string[] {
  const t = (text ?? '').trim().replace(/\n+/g, ' ').replace(/\s+/g, ' ');
  if (!t) return [];
  if (visualWidthUnits(t) <= maxUnits) return [t];

  const lines: string[] = [];
  let remaining = t;
  while (visualWidthUnits(remaining) > maxUnits) {
    let breakPoint = -1;
    let acc = 0;
    let lastSpace = -1;
    for (let i = 0; i < remaining.length; i++) {
      acc += visualWidthUnits(remaining[i]);
      if (remaining[i] === ' ') lastSpace = i;
      if (acc > maxUnits) {
        breakPoint = lastSpace >= 0 ? lastSpace : i;
        break;
      }
    }
    if (breakPoint < 0) break;
    lines.push(remaining.slice(0, breakPoint).trim());
    remaining = remaining.slice(breakPoint).trim();
  }
  if (remaining) lines.push(remaining);
  return lines;
}

/** boxWidth(1080 기준) + fontSize에서 한 줄 maxUnits 계산 */
export function maxUnitsForBox(boxWidth: number, fontSize: number): number {
  return Math.max(3, (boxWidth * 0.98) / fontSize);
}

/**
 * CSS font-family.
 * Pretendard는 앱에 번들된 ttf (@font-face로 로드)이며 ffmpeg drawtext와 동일 파일 사용.
 * 다른 폰트도 시스템에 따라 fallback.
 */
export function osAwareCssFontFamily(fontName: string): string {
  // Pretendard는 앱 번들 폰트 — 모든 OS에서 동일하게 작동
  if (fontName === 'Pretendard') {
    return '"Pretendard", sans-serif';
  }
  if (typeof navigator === 'undefined') return `"${fontName}", "Pretendard", sans-serif`;
  const isMac = /Mac/i.test(navigator.platform || '') || /Mac/i.test(navigator.userAgent || '');
  if (isMac) {
    const macMap: Record<string, string> = {
      'Malgun Gothic': '"Apple SD Gothic Neo", "Pretendard", sans-serif',
      '맑은 고딕': '"Apple SD Gothic Neo", "Pretendard", sans-serif',
      Standard: 'Helvetica, Arial, sans-serif',
    };
    return macMap[fontName] || `"${fontName}", "Pretendard", "Apple SD Gothic Neo", sans-serif`;
  }
  return `"${fontName}", "Pretendard", "Malgun Gothic", sans-serif`;
}
