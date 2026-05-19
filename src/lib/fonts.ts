// 시스템 폰트 매핑 (FFmpeg drawtext 용 fontfile 경로)
// drawtext는 fontfile 절대경로가 필요하므로 시스템 폰트 폴더를 직접 참조

import fs from 'fs';
import os from 'os';
import path from 'path';

const IS_WINDOWS = process.platform === 'win32';
const IS_MAC = process.platform === 'darwin';

// Windows 폰트 경로
const WIN_FONTS = 'C:/Windows/Fonts';
const WIN_USER_FONTS = `${process.env.LOCALAPPDATA || 'C:/Users/' + (process.env.USERNAME || 'user') + '/AppData/Local'}/Microsoft/Windows/Fonts`;

// Mac 폰트 경로
const MAC_SYS_FONTS = '/System/Library/Fonts';
const MAC_LIB_FONTS = '/Library/Fonts';
const MAC_USER_FONTS = `${os.homedir()}/Library/Fonts`;

// 앱에 번들된 폰트 (모든 OS 공통, 항상 같은 결과 보장)
// dev: <project>/public/fonts/, prod(Electron): resources/public/fonts/
const BUNDLED_FONTS_DIR = (() => {
  // Electron 패키지된 앱이면 process.resourcesPath, 아니면 cwd
  const candidates = [
    path.join(process.cwd(), 'public', 'fonts'),
    path.join(process.cwd(), 'resources', 'public', 'fonts'),
    process.env.RESOURCES_PATH
      ? path.join(process.env.RESOURCES_PATH, 'public', 'fonts')
      : '',
  ].filter(Boolean);
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0];
})();

const PRETENDARD_REGULAR = path.join(BUNDLED_FONTS_DIR, 'Pretendard-Regular.ttf');
const PRETENDARD_BOLD = path.join(BUNDLED_FONTS_DIR, 'Pretendard-Bold.ttf');

export interface FontMapping {
  name: string;
  displayName: string;
  regular: string;
  bold: string;
}

/**
 * OS별 첫 번째 존재하는 경로 반환 (FFmpeg에 넘기기 위한 절대경로).
 */
function pickPath(candidates: string[]): string {
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch { /* ignore */ }
  }
  return candidates[0]; // 모두 없어도 첫 후보 반환 (fallback에서 처리)
}

// Mac 한국어 기본 폰트 (시스템 기본 보장)
const MAC_KO_REGULAR = `${MAC_SYS_FONTS}/AppleSDGothicNeo.ttc`;
const MAC_KO_BOLD = `${MAC_SYS_FONTS}/AppleSDGothicNeo.ttc`;

// 한국어 시스템 폰트 매핑 (OS별 경로 분기)
export const FONTS: FontMapping[] = [
  {
    // Pretendard — 앱에 번들된 한국어 친화 폰트 (Regular/Bold 분리 ttf)
    // OS 무관 항상 동일 결과 보장
    name: 'Pretendard',
    displayName: 'Pretendard (기본)',
    regular: pickPath([PRETENDARD_REGULAR, MAC_KO_REGULAR, `${WIN_FONTS}/malgun.ttf`]),
    bold: pickPath([PRETENDARD_BOLD, MAC_KO_BOLD, `${WIN_FONTS}/malgunbd.ttf`]),
  },
  {
    name: 'Standard',
    displayName: '스탠다드',
    regular: IS_MAC
      ? pickPath([`${MAC_LIB_FONTS}/Arial.ttf`, `${MAC_SYS_FONTS}/Supplemental/Arial.ttf`, MAC_KO_REGULAR])
      : `${WIN_FONTS}/arial.ttf`,
    bold: IS_MAC
      ? pickPath([`${MAC_LIB_FONTS}/Arial Bold.ttf`, `${MAC_SYS_FONTS}/Supplemental/Arial Bold.ttf`, MAC_KO_BOLD])
      : `${WIN_FONTS}/arialbd.ttf`,
  },
  {
    name: 'Malgun Gothic',
    displayName: IS_MAC ? '애플 SD 산돌고딕' : '맑은 고딕',
    regular: IS_MAC ? MAC_KO_REGULAR : `${WIN_FONTS}/malgun.ttf`,
    bold: IS_MAC ? MAC_KO_BOLD : `${WIN_FONTS}/malgunbd.ttf`,
  },
  {
    name: 'Nanum Gothic',
    displayName: '나눔고딕',
    regular: IS_MAC
      ? pickPath([`${MAC_USER_FONTS}/NanumGothic.otf`, `${MAC_USER_FONTS}/NanumGothic.ttf`, MAC_KO_REGULAR])
      : `${WIN_FONTS}/NanumGothic.ttf`,
    bold: IS_MAC
      ? pickPath([`${MAC_USER_FONTS}/NanumGothicBold.otf`, `${MAC_USER_FONTS}/NanumGothic-Bold.ttf`, MAC_KO_BOLD])
      : `${WIN_FONTS}/NanumGothic.ttf`,
  },
  {
    name: 'Nanum Square',
    displayName: '나눔스퀘어',
    regular: IS_MAC
      ? pickPath([`${MAC_USER_FONTS}/NanumSquareR.ttf`, `${MAC_USER_FONTS}/NanumSquare-Regular.ttf`, MAC_KO_REGULAR])
      : `${WIN_FONTS}/NanumSquareR.ttf`,
    bold: IS_MAC
      ? pickPath([`${MAC_USER_FONTS}/NanumSquareB.ttf`, `${MAC_USER_FONTS}/NanumSquare-Bold.ttf`, MAC_KO_BOLD])
      : `${WIN_FONTS}/NanumSquareR.ttf`,
  },
  {
    name: 'Hancom Gothic',
    displayName: '한컴고딕',
    regular: IS_MAC
      ? pickPath([`${MAC_USER_FONTS}/Hancom Gothic Regular.ttf`, MAC_KO_REGULAR])
      : `${WIN_FONTS}/Hancom Gothic Regular.ttf`,
    bold: IS_MAC
      ? pickPath([`${MAC_USER_FONTS}/Hancom Gothic Bold.ttf`, MAC_KO_BOLD])
      : `${WIN_FONTS}/Hancom Gothic Bold.ttf`,
  },
  {
    name: 'Yes24',
    displayName: 'YES24 고딕',
    regular: IS_MAC
      ? pickPath([`${MAC_USER_FONTS}/YES24GothicR.ttf`, MAC_KO_REGULAR])
      : `${WIN_FONTS}/YES24GothicR.ttf`,
    bold: IS_MAC
      ? pickPath([`${MAC_USER_FONTS}/YES24GothicR.ttf`, MAC_KO_BOLD])
      : `${WIN_FONTS}/YES24GothicR.ttf`,
  },
  {
    name: 'Gulim',
    displayName: '굴림',
    regular: IS_MAC
      ? pickPath([`${MAC_USER_FONTS}/Gulim.ttc`, MAC_KO_REGULAR])
      : `${WIN_FONTS}/gulim.ttc`,
    bold: IS_MAC
      ? pickPath([`${MAC_USER_FONTS}/Gulim.ttc`, MAC_KO_BOLD])
      : `${WIN_FONTS}/gulim.ttc`,
  },
];

// IS_WINDOWS는 위에서 정의됨
void IS_WINDOWS; // unused 경고 회피 (혹시 추후 사용)

/**
 * 폰트 이름으로 fontfile 경로 반환. 없으면 맑은 고딕으로 폴백.
 */
export function resolveFontFile(fontName: string, bold: boolean = false): string {
  const f = FONTS.find((x) => x.name === fontName) || FONTS[0];
  const target = bold ? f.bold : f.regular;
  if (fs.existsSync(target)) return target;
  // 폴백: 맑은 고딕
  const fallback = bold ? FONTS[0].bold : FONTS[0].regular;
  return fallback;
}


/**
 * FFmpeg 필터에 사용할 수 있도록 경로의 콜론과 백슬래시 이스케이프
 */
export function ffmpegEscapePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/:/g, '\\:');
}

/**
 * 한국어 텍스트를 줄바꿈 (글자 수 기반)
 */
export function splitKoreanLines(text: string, maxCharsPerLine: number, maxLines: number = 2): string[] {
  if (!text) return [];
  const t = text.trim();
  if (t.length <= maxCharsPerLine) return [t];

  const lines: string[] = [];
  let remaining = t;
  while (remaining.length > 0 && lines.length < maxLines) {
    if (remaining.length <= maxCharsPerLine) {
      lines.push(remaining);
      break;
    }
    let breakPoint = remaining.lastIndexOf(' ', maxCharsPerLine);
    if (breakPoint <= maxCharsPerLine / 2) breakPoint = maxCharsPerLine;
    lines.push(remaining.slice(0, breakPoint).trim());
    remaining = remaining.slice(breakPoint).trim();
  }
  return lines;
}
