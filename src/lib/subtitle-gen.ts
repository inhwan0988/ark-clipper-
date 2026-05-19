import type { Transcript } from '@/types';
import path from 'path';
import fs from 'fs';
import { hexToAss } from './subtitle-templates';

/**
 * OS별 ASS Fontname 매핑.
 * ASS의 Fontname은 시스템에 설치된 폰트의 PostScript/family 이름과 일치해야
 * libass(ffmpeg subtitles filter)가 렌더링할 수 있다. Mac에는 'Malgun Gothic',
 * '맑은 고딕'이 없으므로 한국어 글리프 fallback이 깨져 텍스트가 빈칸으로 나옴.
 */
function osAwareAssFontName(name: string): string {
  if (process.platform !== 'darwin') return name; // Windows/Linux는 그대로
  const macMap: Record<string, string> = {
    'Malgun Gothic': 'Apple SD Gothic Neo',
    '맑은 고딕': 'Apple SD Gothic Neo',
    Standard: 'Helvetica',
    Gulim: 'Apple SD Gothic Neo',
    굴림: 'Apple SD Gothic Neo',
    'Hancom Gothic': 'Apple SD Gothic Neo',
    한컴고딕: 'Apple SD Gothic Neo',
    'Yes24': 'Apple SD Gothic Neo',
    YES24: 'Apple SD Gothic Neo',
  };
  return macMap[name] || name;
}

/**
 * 음성 인식 자막(말자막) 스타일 설정
 */
export interface SubtitleConfig {
  fontName: string;
  fontSize: number;
  color: string;
  bold: boolean;
  outlineEnabled: boolean;
  outlineColor: string;
  outlineWidth: number;
  bgEnabled: boolean;
  bgColor: string;
  bgOpacity: number;  // 0-100
  y: number;          // 1080x1920 기준 Y (bottom-center alignment 기준)
  /** 한 줄 최대 글자 수 (사용자 지정). 미설정 시 fontSize 기반 자동 계산 */
  maxCharsPerLine?: number;
}

/**
 * 텍스트 오버레이 (제목, 채널명)
 */
export interface TextOverlay {
  text: string;
  fontName: string;
  fontSize: number;
  color: string;
  bold: boolean;
  x?: number;
  y?: number;
  align?: 'left' | 'center' | 'right';
  /** 제목 박스 너비 (1080 기준). 미지정 시 1080. 줄바꿈 폭 결정. */
  boxWidth?: number;
}

interface BuildOptions {
  layout: 'letterbox' | 'crop_vertical';
  title?: TextOverlay;
  channel?: TextOverlay;
  subtitle?: SubtitleConfig;
}

function toAssTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}:${m.toString().padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
}

function alignToAssCode(align: 'left' | 'center' | 'right' | undefined, vertical: 'top' | 'bottom'): number {
  const a = align || 'center';
  if (vertical === 'top') {
    return a === 'left' ? 7 : a === 'right' ? 9 : 8;
  }
  return a === 'left' ? 1 : a === 'right' ? 3 : 2;
}

/**
 * ASS BackColour는 &HAABBGGRR 형식.
 * alpha: 0=불투명, 255=완전 투명
 */
function bgColorToAss(hex: string, opacityPct: number): string {
  const clean = hex.replace(/[#&H]/g, '');
  if (clean.length !== 6) return '&H00000000';
  // opacity 0~100 → ASS alpha 255~0 (반전)
  const alpha = Math.max(0, Math.min(255, Math.round((100 - opacityPct) * 2.55)));
  const aHex = alpha.toString(16).padStart(2, '0').toUpperCase();
  const rr = clean.slice(0, 2);
  const gg = clean.slice(2, 4);
  const bb = clean.slice(4, 6);
  return `&H${aHex}${bb}${gg}${rr}`;
}

function buildAssHeader(opts: BuildOptions): string {
  const styles: string[] = [];

  // 말자막 스타일 (있을 때만)
  if (opts.subtitle) {
    const s = opts.subtitle;
    const primary = hexToAss(s.color, '00');
    const outline = hexToAss(s.outlineColor, '00');
    const back = s.bgEnabled ? bgColorToAss(s.bgColor, s.bgOpacity) : '&H00000000';

    // BorderStyle 결정:
    //  - 배경 사용: 3 (opaque box). Outline 값으로 패딩 효과
    //  - 외곽선만: 1 (outline + shadow)
    //  - 둘 다 사용: 3 사용 + 외곽선은 box 효과 (ASS 한계)
    //  - 둘 다 끔: 1 + Outline=0
    const borderStyle = s.bgEnabled ? 3 : 1;
    const outlineW = s.bgEnabled
      ? Math.max(8, s.outlineEnabled ? s.outlineWidth + 6 : 8)  // 배경 패딩
      : (s.outlineEnabled ? s.outlineWidth : 0);
    const shadow = s.bgEnabled ? 0 : (s.outlineEnabled ? 1 : 0);

    // marginV: bottom-center alignment 기준, 화면 하단으로부터의 거리
    const marginV = Math.max(40, 1920 - s.y);

    styles.push(
      `Style: Default,${osAwareAssFontName(s.fontName)},${s.fontSize},${primary},&H000000FF,${outline},${back},${s.bold ? -1 : 0},0,0,0,100,100,0,0,${borderStyle},${outlineW},${shadow},2,40,40,${marginV},1`
    );
  }

  // 타이틀 스타일 — 가독성 위해 검정 외곽선 2px 기본
  if (opts.title) {
    const tColor = hexToAss(opts.title.color, '00');
    styles.push(
      `Style: Title,${osAwareAssFontName(opts.title.fontName)},${opts.title.fontSize},${tColor},&H000000FF,&H00000000,&H00000000,${opts.title.bold ? -1 : 0},0,0,0,100,100,0,0,1,2,0,8,40,40,180,1`
    );
  }

  // 채널 스타일
  if (opts.channel) {
    const cColor = hexToAss(opts.channel.color, '00');
    styles.push(
      `Style: Channel,${osAwareAssFontName(opts.channel.fontName)},${opts.channel.fontSize},${cColor},&H000000FF,&H00000000,&H00000000,${opts.channel.bold ? -1 : 0},0,0,0,100,100,0,0,1,1,0,2,40,40,80,1`
    );
  }

  return `[Script Info]
Title: ARK Clipper Subtitles
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
${styles.join('\n')}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
}

// 폰트 크기에 따른 한 줄 최대 글자 수
// 한글은 전각(fullwidth)이라 fontSize × 1.0 픽셀 너비 차지. 가용 너비 88%.
function maxCharsForFontSize(fontSize: number): number {
  const charWidth = fontSize * 1.0;
  const safeWidth = 1080 * 0.88;
  return Math.max(4, Math.floor(safeWidth / charWidth));
}
const KOREAN_2CHAR_PARTICLES = ['으로', '에서', '에게', '한테', '부터', '까지', '이나', '거나', '면서', '에는', '에도', '에만'];
const KOREAN_1CHAR_PARTICLES = ['은', '는', '이', '가', '을', '를', '에', '의', '도', '만', '와', '과', '로', '며', '서', '고', '면'];
const KOREAN_SENTENCE_END = ['다', '요', '죠', '까', '네', '군', '소', '오'];
const PUNCTUATION_REGEX = /[.,!?;。、]/;

/**
 * 한국어 문장을 자연스러운 위치에서 잘라 여러 줄로 분할.
 * 단어를 중간에 자르지 않음. maxChars 초과해서라도 어절 경계 보존.
 */
function splitKoreanText(text: string, maxChars: number = 12): string[] {
  if (!text) return [];
  const t = text.trim().replace(/\s+/g, ' ');
  if (t.length <= maxChars) return [t];

  const lines: string[] = [];
  let remaining = t;

  while (remaining.length > maxChars) {
    const limit = Math.min(maxChars, remaining.length - 1);
    const minBreak = Math.max(3, Math.floor(maxChars * 0.4));
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
    // 6) 단어 보존: maxChars 초과 허용 (최대 +3자) + 공백/문장부호 찾기
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
      breakPoint = nextSpace > 0 ? nextSpace + 1 : maxChars;
    }

    lines.push(remaining.slice(0, breakPoint).trim());
    remaining = remaining.slice(breakPoint).trim();
  }
  if (remaining) lines.push(remaining);
  return lines;
}

export function generateSubtitleFile(
  transcript: Transcript | null,
  startTime: number,
  endTime: number,
  outputDir: string,
  clipId: string,
  layout: 'letterbox' | 'crop_vertical',
  title?: TextOverlay,
  channel?: TextOverlay,
  subtitle?: SubtitleConfig
): string {
  const outputPath = path.join(outputDir, `${clipId}.ass`);

  const header = buildAssHeader({ layout, title, channel, subtitle });

  let events = '';

  // 말자막: 한 줄씩 순차 표시 (사용자 지정 maxCharsPerLine 우선, 없으면 fontSize 기반 자동)
  if (subtitle && transcript) {
    const dynMax = subtitle.maxCharsPerLine ?? maxCharsForFontSize(subtitle.fontSize);
    const relevantSegments = transcript.segments.filter(
      (seg) => seg.end > startTime && seg.start < endTime
    );

    for (const seg of relevantSegments) {
      const relStart = Math.max(0, seg.start - startTime);
      const relEnd = Math.min(endTime - startTime, seg.end - startTime);
      const segDuration = relEnd - relStart;
      if (segDuration <= 0) continue;

      const text = seg.text.trim().replace(/\n+/g, ' ');
      const lines = splitKoreanText(text, dynMax);

      // 라인이 dynMax를 초과한 경우(단어 보존 차원)에는 \fscx로 폰트 축소 적용
      const safeWidthAss = 1080 * 0.88;
      const charWidthAss = subtitle.fontSize * 1.0;
      const computeOverride = (ln: string): string => {
        const est = ln.length * charWidthAss;
        if (est <= safeWidthAss) return '';
        const sc = Math.max(50, Math.round((safeWidthAss / est) * 100));
        return `{\\fscx${sc}\\fscy${sc}}`;
      };

      if (lines.length === 1) {
        const ov = computeOverride(lines[0]);
        events += `Dialogue: 0,${toAssTime(relStart)},${toAssTime(relEnd)},Default,,0,0,0,,${ov}${lines[0]}\n`;
      } else {
        // 글자 수 비율로 시간 배분
        const totalChars = lines.reduce((sum, l) => sum + Math.max(1, l.length), 0);
        let cursor = relStart;
        for (let i = 0; i < lines.length; i++) {
          const portion = Math.max(1, lines[i].length) / totalChars;
          // 마지막 라인은 정확히 segEnd까지 (rounding 누적 오차 방지)
          const lineEnd = i === lines.length - 1 ? relEnd : cursor + segDuration * portion;
          const ov = computeOverride(lines[i]);
          events += `Dialogue: 0,${toAssTime(cursor)},${toAssTime(lineEnd)},Default,,0,0,0,,${ov}${lines[i]}\n`;
          cursor = lineEnd;
        }
      }
    }
  }

  // 타이틀 — 제목 박스 너비(boxWidth)에 따라 줄바꿈 폭 동적
  if (title && title.text.trim()) {
    const rawTitle = title.text.trim().replace(/\n+/g, ' ');
    // boxWidth 미지정 시 1080 기준. 폰트 크기 대비 가용 글자 수 계산.
    // 한글은 fontSize × 0.95 픽셀폭 차지로 추정 (전각).
    const safeWidth = (title.boxWidth ?? 1080) * 0.95;
    const charWidth = title.fontSize * 0.95;
    const maxChars = Math.max(4, Math.floor(safeWidth / charWidth));
    // splitKoreanText 재활용 (자연스러운 줄바꿈)
    const splitLines = splitKoreanText(rawTitle, maxChars);
    // 너무 길면 마지막 줄에 "…"
    const trimmed = splitLines.length > 3 ? splitLines.slice(0, 3) : splitLines;
    if (splitLines.length > 3) {
      trimmed[2] = (trimmed[2] || '').slice(0, Math.max(0, maxChars - 1)) + '…';
    }
    const titleText = trimmed.join('\\N');
    const clipDuration = endTime - startTime;
    const tx = title.x ?? 540;
    const ty = title.y ?? 180;
    const an = alignToAssCode(title.align, 'top');
    const tags = `{\\an${an}\\pos(${Math.round(tx)},${Math.round(ty)})}`;
    events += `Dialogue: 0,${toAssTime(0)},${toAssTime(clipDuration)},Title,,0,0,0,,${tags}${titleText}\n`;
  }

  // 채널명
  if (channel && channel.text.trim()) {
    const clipDuration = endTime - startTime;
    const cx = channel.x ?? 540;
    const cy = channel.y ?? 1840;
    const an = alignToAssCode(channel.align, 'bottom');
    const tags = `{\\an${an}\\pos(${Math.round(cx)},${Math.round(cy)})}`;
    events += `Dialogue: 0,${toAssTime(0)},${toAssTime(clipDuration)},Channel,,0,0,0,,${tags}${channel.text.trim()}\n`;
  }

  fs.writeFileSync(outputPath, header + events, 'utf-8');
  return outputPath;
}
