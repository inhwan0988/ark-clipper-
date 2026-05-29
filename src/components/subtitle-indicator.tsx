'use client';

import type { ClipCustomization } from './clip-customizer';

const OUTPUT_H = 1920;

/**
 * 폰트 크기에 맞춰 한 줄에 들어가는 최대 글자 수 자동 계산.
 * 한글은 전각(fullwidth)이라 fontSize와 거의 같은 너비를 차지함.
 * 안전 마진 포함 (서버 subtitle-gen과 동일하게 유지):
 *  - 글자 너비: fontSize × 1.0 (한글 전각 기준)
 *  - 가용 너비: 1080 × 0.80 (타이틀 세이프 = 좌우 10% 여백) → safe zone 안에 들어옴
 */
export function maxCharsForFontSize(fontSize: number): number {
  const charWidth = fontSize * 1.0;
  const safeWidth = 1080 * 0.8;
  return Math.max(4, Math.floor(safeWidth / charWidth));
}

const KOREAN_2CHAR_PARTICLES = ['으로', '에서', '에게', '한테', '부터', '까지', '이나', '거나', '면서', '에는', '에도', '에만'];
const KOREAN_1CHAR_PARTICLES = ['은', '는', '이', '가', '을', '를', '에', '의', '도', '만', '와', '과', '로', '며', '서', '고', '면'];
const PUNCTUATION_REGEX = /[.,!?;。、]/;
const KOREAN_SENTENCE_END = ['다', '요', '죠', '까', '네', '군', '소', '오'];

/**
 * 한국어 문장을 자연스러운 위치에서 잘라서 여러 줄로 분할.
 *
 * 핵심: **단어(어절)를 중간에 자르지 않음**.
 * 우선순위:
 *  1) 문장부호 (가장 자연스러운 경계)
 *  2) 공백 (어절 경계 - 가장 안전)
 *  3) 한국어 조사 끝 (~은/는/이/가, ~에서/까지 등)
 *  4) 어미 끝 (~다/요/죠 등)
 *  5) 어절 끝까지 가서 자르기 (maxChars 초과 허용 - 단어 보존)
 */
export function smartSplitKoreanSubtitle(text: string, maxChars: number = 12): string[] {
  if (!text) return [];
  const t = text.trim().replace(/\s+/g, ' ');
  if (t.length <= maxChars) return [t];

  const lines: string[] = [];
  let remaining = t;

  while (remaining.length > maxChars) {
    const limit = Math.min(maxChars, remaining.length - 1);
    const minBreak = Math.max(3, Math.floor(maxChars * 0.4));
    // 단어 보존 위해 약간 초과 허용 (최대 3자까지)
    const lookAhead = Math.min(maxChars + 3, remaining.length - 1);
    let breakPoint = -1;

    // 1) 문장부호 within maxChars
    for (let i = limit; i >= minBreak; i--) {
      if (PUNCTUATION_REGEX.test(remaining[i])) {
        breakPoint = i + 1;
        break;
      }
    }

    // 2) 공백 within maxChars
    if (breakPoint < 0) {
      const sp = remaining.lastIndexOf(' ', maxChars);
      if (sp >= minBreak) breakPoint = sp + 1;
    }

    // 3) 2글자 조사 within maxChars
    if (breakPoint < 0) {
      for (let i = limit - 1; i >= minBreak; i--) {
        const two = remaining.slice(i - 1, i + 1);
        if (KOREAN_2CHAR_PARTICLES.includes(two)) {
          breakPoint = i + 1;
          break;
        }
      }
    }

    // 4) 1글자 조사 within maxChars
    if (breakPoint < 0) {
      for (let i = limit; i >= minBreak; i--) {
        if (KOREAN_1CHAR_PARTICLES.includes(remaining[i])) {
          breakPoint = i + 1;
          break;
        }
      }
    }

    // 5) 어미 끝 within maxChars
    if (breakPoint < 0) {
      for (let i = limit; i >= minBreak; i--) {
        if (KOREAN_SENTENCE_END.includes(remaining[i])) {
          breakPoint = i + 1;
          break;
        }
      }
    }

    // 6) 단어 보존: maxChars 초과 허용하고 다음 공백/문장부호 찾기
    if (breakPoint < 0) {
      for (let i = maxChars + 1; i <= lookAhead; i++) {
        if (remaining[i] === ' ' || PUNCTUATION_REGEX.test(remaining[i])) {
          breakPoint = i + 1;
          break;
        }
      }
    }

    // 7) 마지막 보루: 다음 공백까지 (단어 중간 절대 금지)
    if (breakPoint < 0) {
      const nextSpace = remaining.indexOf(' ', maxChars);
      if (nextSpace > 0) {
        breakPoint = nextSpace + 1;
      } else {
        // 공백이 전혀 없는 텍스트 → 어쩔 수 없이 maxChars에서 자름
        breakPoint = maxChars;
      }
    }

    lines.push(remaining.slice(0, breakPoint).trim());
    remaining = remaining.slice(breakPoint).trim();
  }
  if (remaining) lines.push(remaining);

  return lines;
}

interface Props {
  customization: ClipCustomization;
  scale: number;
  label?: string;
}

/**
 * 9:16 미리보기에 말자막 미리보기를 렌더링.
 * 모든 customization 필드에 안전한 기본값 적용.
 */
export function SubtitleIndicator({ customization, scale, label = '자막' }: Props) {
  const c = customization;

  // 안전한 기본값
  const subtitleBgEnabled = c.subtitleBgEnabled ?? false;
  const subtitleBgColor = c.subtitleBgColor || '000000';
  const subtitleBgOpacity = c.subtitleBgOpacity ?? 60;
  const subtitleOutlineEnabled = c.subtitleOutlineEnabled ?? true;
  const subtitleOutlineColor = c.subtitleOutlineColor || '000000';
  const subtitleOutlineWidth = c.subtitleOutlineWidth ?? 4;
  const subtitleColor = c.subtitleColor || 'FFFFFF';
  const subtitleFontName = c.subtitleFontName || 'Malgun Gothic';
  const subtitleFontSize = c.subtitleFontSize ?? 56;
  const subtitleBold = c.subtitleBold ?? true;
  const subtitleY = c.subtitleY ?? 1670;

  const safeHex = (h: string) => (/^[0-9A-Fa-f]{6}$/.test(h) ? h : '000000');
  const bgHex = safeHex(subtitleBgColor);

  const bgRgba = subtitleBgEnabled
    ? `rgba(${parseInt(bgHex.slice(0, 2), 16)},${parseInt(bgHex.slice(2, 4), 16)},${parseInt(bgHex.slice(4, 6), 16)},${subtitleBgOpacity / 100})`
    : 'transparent';
  const outlineW = subtitleOutlineEnabled ? subtitleOutlineWidth * scale : 0;
  const outlineColor = `#${safeHex(subtitleOutlineColor)}`;
  const textShadow = subtitleOutlineEnabled && outlineW > 0
    ? Array.from({ length: 8 }, (_, i) => {
        const angle = (i * 45) * Math.PI / 180;
        const x = Math.cos(angle) * outlineW;
        const y = Math.sin(angle) * outlineW;
        return `${x.toFixed(1)}px ${y.toFixed(1)}px 0 ${outlineColor}`;
      }).join(', ')
    : 'none';

  // 한 줄만 표시. 만약 길이가 너무 길면 자동 폰트 축소(시각 안전망)
  // 호출자가 maxCharsForFontSize에 맞게 잘라 전달하므로 보통 발동 안 함.
  const charWidth = subtitleFontSize * 1.0;
  const safeWidth = 1080 * 0.88;
  const estWidth = label.length * charWidth;
  const fitScale = estWidth > safeWidth ? safeWidth / estWidth : 1;
  const renderedFontSize = subtitleFontSize * fitScale * scale;

  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 -translate-y-full text-center whitespace-nowrap"
      style={{
        top: `${(subtitleY / OUTPUT_H) * 100}%`,
        maxWidth: '88%',
        fontSize: `${renderedFontSize}px`,
        fontFamily: subtitleFontName,
        fontWeight: subtitleBold ? 700 : 400,
        color: `#${safeHex(subtitleColor)}`,
        backgroundColor: bgRgba,
        padding: subtitleBgEnabled ? `${Math.max(2, 4 * scale * 4)}px ${Math.max(4, 6 * scale * 4)}px` : '0',
        borderRadius: subtitleBgEnabled ? '4px' : '0',
        textShadow,
        lineHeight: 1.1,
      }}
    >
      {label}
    </div>
  );
}

/**
 * 세그먼트와 현재 재생 시간으로부터 지금 보여줄 한 줄을 계산.
 * 세그먼트 안의 라인들에 글자 수 비율로 시간을 할당.
 */
export function getCurrentSubtitleLine(
  segStart: number,
  segEnd: number,
  segText: string,
  currentTime: number,
  maxChars: number = 12
): string {
  const lines = smartSplitKoreanSubtitle(segText, maxChars);
  if (lines.length === 0) return '';
  if (lines.length === 1) return lines[0];

  const totalDuration = Math.max(0.001, segEnd - segStart);
  const elapsed = Math.max(0, currentTime - segStart);
  const ratio = Math.min(1, elapsed / totalDuration);

  const totalChars = lines.reduce((sum, l) => sum + l.length, 0) || 1;
  let acc = 0;
  for (let i = 0; i < lines.length; i++) {
    acc += lines[i].length / totalChars;
    if (ratio <= acc + 1e-6) return lines[i];
  }
  return lines[lines.length - 1];
}
