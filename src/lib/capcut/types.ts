/**
 * 캡컷 반자동 편집툴 — 타입 정의.
 */

export type WizardStep = 1 | 2 | 3 | 4;

/** Whisper 단어별 timestamp */
export interface Word {
  word: string;
  start: number;
  end: number;
}

/** 자막 한 줄 */
export interface SubtitleSegment {
  start: number;
  end: number;
  text: string;
  words?: Word[];
}

/** 무음 구간 (잘라낼 부분) */
export interface SilenceSegment {
  start: number;
  end: number;
  duration: number;
  type: "leading" | "middle" | "trailing"; // 영상 시작/중간/끝
}

/** 포인트 자막 (강조할 부분) */
export interface PointSubtitle {
  id: number;
  time: number; // 표시 시작 시간 (초)
  duration: number; // 표시 지속 시간 (초)
  text: string; // 표시될 강조 텍스트 (예: "회당 3억!!")
  emoji?: string; // 부가 이모지
  style?: "shock" | "emphasis" | "callout" | "punchline";
  sourceText?: string; // 원본 자막의 어느 부분인지
  soundEffect?: SoundEffect | null; // 매칭된 효과음
}

/** 효과음 */
export interface SoundEffect {
  id: string;
  name: string;
  category: "pop" | "ding" | "woosh" | "impact" | "comic" | "applause" | "transition";
  duration: number; // 초
  url: string; // 다운로드 URL
  preview?: string; // 미리듣기 URL
}

/** 영상 처리 결과 */
export interface ProcessResult {
  videoId: string;
  duration: number; // 전체 audio 길이 (초)
  subtitles: SubtitleSegment[];
  silences: SilenceSegment[];
  points: PointSubtitle[];
  detectedLanguage: string;
}

/** 캡컷에 import 가능한 export package */
export interface CapcutExportPackage {
  srtContent: string; // .srt 파일 내용
  soundEffects: { time: number; effect: SoundEffect }[];
  cutGuide: SilenceSegment[];
  pointGuide: PointSubtitle[];
}
