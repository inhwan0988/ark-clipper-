// 자막 템플릿 정의
// ASS 색상 형식: &HAABBGGRR (alpha + reverse RGB hex)

export interface SubtitleTemplate {
  id: string;
  name: string;
  description: string;
  fontName: string;
  fontSize: number;
  bold: boolean;
  primaryColor: string;   // hex like "FFFFFF"
  outlineColor: string;
  backColor: string;      // shadow/box
  outline: number;
  shadow: number;
  marginV: number;
  alignment: number;      // 2=bottom-center, 5=middle-center, 8=top-center
  borderStyle: number;    // 1=outline only, 3=opaque box
}

export const TEMPLATES: SubtitleTemplate[] = [
  {
    id: 'no-outline',
    name: '외곽선 없음',
    description: '깔끔한 흰색 글자만',
    fontName: 'Malgun Gothic',
    fontSize: 56,
    bold: true,
    primaryColor: 'FFFFFF',
    outlineColor: '000000',
    backColor: '00000000',
    outline: 0,
    shadow: 0,
    marginV: 200,
    alignment: 2,
    borderStyle: 1,
  },
  {
    id: 'classic',
    name: '클래식',
    description: '검정 외곽선 + 흰색 글자 (기본)',
    fontName: 'Malgun Gothic',
    fontSize: 56,
    bold: true,
    primaryColor: 'FFFFFF',
    outlineColor: '000000',
    backColor: '80000000',
    outline: 4,
    shadow: 1,
    marginV: 200,
    alignment: 2,
    borderStyle: 1,
  },
  {
    id: 'youtube',
    name: '유튜브 스타일',
    description: '검정 박스 + 흰색 글자',
    fontName: 'Malgun Gothic',
    fontSize: 52,
    bold: true,
    primaryColor: 'FFFFFF',
    outlineColor: '000000',
    backColor: 'CC000000',
    outline: 0,
    shadow: 0,
    marginV: 220,
    alignment: 2,
    borderStyle: 3,
  },
  {
    id: 'tiktok',
    name: '틱톡 스타일',
    description: '큰 글자, 두꺼운 외곽선',
    fontName: 'Malgun Gothic',
    fontSize: 64,
    bold: true,
    primaryColor: 'FFFFFF',
    outlineColor: '000000',
    backColor: 'AA000000',
    outline: 6,
    shadow: 2,
    marginV: 180,
    alignment: 2,
    borderStyle: 1,
  },
  {
    id: 'highlight-yellow',
    name: '강조 노랑',
    description: '노란색 강조 자막',
    fontName: 'Malgun Gothic',
    fontSize: 58,
    bold: true,
    primaryColor: 'FFFF00',
    outlineColor: '000000',
    backColor: '80000000',
    outline: 4,
    shadow: 1,
    marginV: 200,
    alignment: 2,
    borderStyle: 1,
  },
  {
    id: 'minimal',
    name: '미니멀',
    description: '얇은 외곽선, 깔끔한 느낌',
    fontName: 'Malgun Gothic',
    fontSize: 48,
    bold: false,
    primaryColor: 'FFFFFF',
    outlineColor: '000000',
    backColor: '80000000',
    outline: 2,
    shadow: 1,
    marginV: 220,
    alignment: 2,
    borderStyle: 1,
  },
  {
    id: 'bottom-bar',
    name: '하단 바',
    description: '화면 하단에 검정 바',
    fontName: 'Malgun Gothic',
    fontSize: 50,
    bold: true,
    primaryColor: 'FFFFFF',
    outlineColor: '000000',
    backColor: 'FF000000',
    outline: 0,
    shadow: 0,
    marginV: 100,
    alignment: 2,
    borderStyle: 3,
  },
];

export function getTemplate(id: string): SubtitleTemplate {
  return TEMPLATES.find((t) => t.id === id) || TEMPLATES[0];
}

// Convert hex color (RRGGBB) → ASS format &HAABBGGRR
export function hexToAss(hex: string, alpha: string = '00'): string {
  // Strip leading # or & if present
  const clean = hex.replace(/[#&H]/g, '');
  // If 8 chars like "AABBGGRR", use as-is
  if (clean.length === 8) {
    return `&H${clean.toUpperCase()}`;
  }
  // RRGGBB → &HAABBGGRR
  if (clean.length !== 6) return '&H00FFFFFF';
  const rr = clean.slice(0, 2);
  const gg = clean.slice(2, 4);
  const bb = clean.slice(4, 6);
  return `&H${alpha}${bb}${gg}${rr}`.toUpperCase();
}
