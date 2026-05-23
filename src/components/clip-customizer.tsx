// ClipCustomization 인터페이스만 export. 실제 UI는 ClipTimelineEditor에 통합됨.

export interface ClipCustomization {
  // 레이아웃
  layout: 'letterbox' | 'crop_vertical';

  // 상단 타이틀 (자동 생성, AI 후킹 제목 사용 - 텍스트는 hook별, 폰트는 공통)
  titleFontName: string;
  titleFontSize: number;
  titleColor: string;
  titleBold: boolean;
  titleAlign: 'left' | 'center' | 'right';
  // 레이아웃별 독립 위치 저장
  titleX: number;          // 레터박스용 X (텍스트 박스 center, 1080 기준)
  titleY: number;          // 레터박스용 Y (1920 기준)
  titleXCrop: number;      // 세로 크롭용 X
  titleYCrop: number;      // 세로 크롭용 Y
  /** 제목 텍스트 박스 너비 (1080 기준, 줄바꿈 폭 결정) */
  titleBoxWidth: number;

  // 배경 영상 (세로 크롭 시 zoom/pan)
  /** 1.0 = 100%, 1.5 = 150% 확대 */
  bgZoom: number;
  /** 가로 오프셋 (1080 기준 px) */
  bgOffsetX: number;
  /** 세로 오프셋 (1920 기준 px) */
  bgOffsetY: number;

  // 하단 채널명
  channelEnabled: boolean;
  channelText: string;
  channelFontName: string;
  channelFontSize: number;
  channelColor: string;
  channelBold: boolean;
  channelAlign: 'left' | 'center' | 'right';
  channelX: number;
  channelY: number;

  // 말자막 (음성 인식, 세로 크롭 전용)
  subtitleEnabled: boolean;
  subtitleFontName: string;
  subtitleFontSize: number;
  subtitleColor: string;            // 글씨 색
  subtitleBold: boolean;
  subtitleOutlineEnabled: boolean;
  subtitleOutlineColor: string;     // 외곽선 색
  subtitleOutlineWidth: number;     // 외곽선 두께
  subtitleBgEnabled: boolean;       // 배경 사용
  subtitleBgColor: string;          // 배경색
  subtitleBgOpacity: number;        // 0-100
  subtitleY: number;                // 위치 Y (1080x1920 기준)
  /** 자막 X 위치 (1080 기준, 540 = 좌우 정중앙) */
  subtitleX?: number;
  /** 한 줄 최대 글자 수 (한국어 기준). default 13 */
  subtitleMaxCharsPerLine?: number;
  /** 자막 박스 너비 (1080 기준). 좌우 핸들로 조정 가능. default 1080 */
  subtitleBoxWidth?: number;

  /** 영상 재생 속도 (1.0 = 정상, 1.5 = 1.5배속, 2.0 = 2배속). default 1.0
   *  ffmpeg setpts(video) + atempo(audio)로 출력 영상에 영구 적용. */
  playbackSpeed?: number;
}
