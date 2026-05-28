export interface Project {
  id: string;
  youtube_url: string;
  title: string | null;
  duration: number | null;
  status: ProjectStatus;
  error_msg: string | null;
  workspace_path: string | null; // 사용자가 지정한 저장 경로 (없으면 기본 workspace 사용)
  created_at: string;
  updated_at: string;
}

export type ProjectStatus =
  | 'created'
  | 'downloading'
  | 'downloaded'
  | 'extracting_audio'
  | 'transcribing'
  | 'transcribed'
  | 'analyzing'
  | 'analyzed'
  | 'clipping'
  | 'complete'
  | 'error';

export interface Clip {
  id: string;
  project_id: string;
  start_time: number;
  end_time: number;
  title: string | null;
  reason: string | null;
  confidence: number | null;
  status: 'pending' | 'processing' | 'complete' | 'error';
  output_path: string | null;
  is_manual: number;
  created_at: string;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  words: TranscriptWord[];
  /** Phase 2 — Claude가 추출한 강조 단어 (자막에서 색/크기로 강조 렌더링) */
  keywords?: string[];
  /** Phase 2 — Claude가 매칭한 emoji 1개 (감정/주제 일치 시) */
  emoji?: string;
}

export interface TranscriptWord {
  word: string;
  start: number;
  end: number;
}

export interface Transcript {
  segments: TranscriptSegment[];
  language: string;
  duration: number;
}

export interface HookSuggestion {
  /** 첫 클립 생성 후 받은 clipId. 편집 후 단일 재생성 시 같은 record를 update. */
  id?: string;
  /**
   * 이 hook(클립) 전용 customization. 사용자가 편집 시 여기에 저장돼
   * 다른 클립에 영향 주지 않음. 미설정 시 전역 default 사용.
   * 타입을 unknown으로 두는 이유: 순환 import 방지 (ClipCustomization은 컴포넌트 쪽에 정의).
   */
  customization?: unknown;
  start_time: number;
  end_time: number;
  title: string;
  reason: string;
  confidence: number;
  suggested_hashtags: string[];
  // 해당 시간 구간의 핵심 대사 인용 (시간-제목 매칭 검증용)
  quote?: string;
  // per-clip 레이아웃 오버라이드 (없으면 전역 customization.layout 사용)
  layout?: 'letterbox' | 'crop_vertical' | 'custom_background';
}

/**
 * 자막+타이틀+채널+layout 설정 묶음. UI 전체 ClipCustomization JSON snapshot 저장용.
 * customization을 unknown으로 유지 — 순환 import 방지 (Template DB 코드는 lib에 있음).
 */
export interface TemplateSettings {
  customization: unknown;
  /** 호환성을 위한 버전 (향후 마이그레이션 대비) */
  version?: number;
}

export interface Template {
  id: string;
  name: string;
  /** JSON-stringified TemplateSettings */
  settings: string;
  created_at: string;
  updated_at: string;
}

export interface ProgressEvent {
  projectId: string;
  step: 'download' | 'extract_audio' | 'transcribe' | 'analyze' | 'clip';
  status: 'pending' | 'running' | 'complete' | 'error';
  progress: number;
  message: string;
  detail?: string;
}
