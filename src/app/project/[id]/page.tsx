'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ProgressTracker } from '@/components/progress-tracker';
import { HookSelector } from '@/components/hook-selector';
import { OutputGallery } from '@/components/output-gallery';
import { ClipEditorV2 } from '@/components/clip-editor-v2';
import { ClipSidebar } from '@/components/clip-sidebar';
import { getStoredApiKey, getStoredOpenAiKey } from '@/components/api-key-settings';
import { triggerDownload } from '@/lib/trigger-download';
import type { ClipCustomization } from '@/components/clip-customizer';
import type { Project, Clip, HookSuggestion, Transcript } from '@/types';

const DEFAULT_CUSTOMIZATION: ClipCustomization = {
  layout: 'letterbox',

  // 상단 제목
  titleFontName: 'Pretendard',
  titleFontSize: 86,
  titleColor: 'FFFFFF',
  titleBold: true,
  titleAlign: 'center',
  titleX: 540,
  titleY: 198,
  // 세로 크롭 전용 위치 (영상 위에 오버레이되므로 좀 더 아래)
  titleXCrop: 540,
  titleYCrop: 220,
  titleBoxWidth: 1000,

  // 배경 영상 (세로 크롭 시)
  bgZoom: 1,
  bgOffsetX: 0,
  bgOffsetY: 0,

  // 하단 채널명
  channelEnabled: true,
  channelText: '',
  channelFontName: 'Pretendard',
  channelFontSize: 44,
  channelColor: 'FFFFFF',
  channelBold: false,
  channelAlign: 'center',
  channelX: 540,
  channelY: 1840,

  // 말자막 (세로 크롭 전용, 기본 OFF)
  subtitleEnabled: false,
  subtitleFontName: 'Pretendard',
  subtitleFontSize: 56,
  subtitleColor: 'FFFFFF',
  subtitleBold: true,
  subtitleOutlineEnabled: true,
  subtitleOutlineColor: '000000',
  subtitleOutlineWidth: 4,
  subtitleBgEnabled: false,
  subtitleBgColor: '000000',
  subtitleBgOpacity: 60,
  subtitleY: 1670,
  subtitleX: 540,
  subtitleMaxCharsPerLine: 13,
  subtitleBoxWidth: 1080,
};

type Phase = 'idle' | 'processing' | 'select_hooks' | 'generating_clips' | 'complete';

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [hooks, setHooks] = useState<HookSuggestion[]>([]);
  const [clips, setClips] = useState<Clip[]>([]);
  const [error, setError] = useState('');
  const [customization, setCustomization] = useState<ClipCustomization>(DEFAULT_CUSTOMIZATION);
  // 사용자가 생성할 쇼츠 개수 (1~10)
  const [clipCount, setClipCount] = useState<number>(6);
  // 현재 좌측 사이드바에서 선택된 hook 인덱스 (우측 편집 화면에 표시)
  const [selectedHookIdx, setSelectedHookIdx] = useState<number>(0);
  // 말자막 미리보기용 transcript
  const [transcript, setTranscript] = useState<Transcript | null>(null);

  // transcript 로드 (편집 화면 자막 미리보기에 사용)
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/projects/transcript?projectId=${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data && data.segments) setTranscript(data);
      })
      .catch(() => { /* ignore */ });
    return () => { cancelled = true; };
  }, [id]);

  const videoSrc = `/api/projects/source-video?projectId=${id}`;
  const duration = project?.duration || 0;

  const fetchProject = useCallback(async () => {
    const res = await fetch('/api/projects');
    if (res.ok) {
      const projects: Project[] = await res.json();
      const p = projects.find((p) => p.id === id);
      if (p) setProject(p);
    }
  }, [id]);

  const loadHooks = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/hooks?projectId=${id}`);
      if (res.ok) {
        const h = await res.json();
        setHooks(h);
        setPhase((curr) => curr === 'complete' ? curr : 'select_hooks');
      }
    } catch { /* ignore */ }
  }, [id]);

  const loadClips = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/clips?projectId=${id}`);
      if (res.ok) setClips(await res.json());
    } catch { /* ignore */ }
  }, [id]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  useEffect(() => {
    if (!project) return;
    if (project.status === 'analyzed') {
      loadHooks();
    } else if (project.status === 'complete') {
      loadHooks();
      loadClips();
      setPhase('complete');
    } else if (project.status === 'created') {
      setPhase('idle');
    }
  }, [project?.status, loadHooks, loadClips]);

  // 클립 생성 완료 시 OS native 알림.
  // 사용자가 다른 작업 중일 때도 완료 인지 가능 (영상 처리는 보통 5-10분 소요).
  useEffect(() => {
    if (phase !== 'complete') return;
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    const show = () => {
      if (Notification.permission === 'granted') {
        try {
          new Notification('Ark Clipper', {
            body: `클립 생성 완료! 다운로드 준비됐어요 🎉`,
          });
        } catch {
          /* ignore */
        }
      }
    };
    if (Notification.permission === 'granted') {
      show();
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then((perm) => {
        if (perm === 'granted') show();
      }).catch(() => {});
    }
  }, [phase]);

  // 단계별 에러 메시지를 명확히 표시하는 안전한 fetch
  async function safeFetch(url: string, init: RequestInit, stepLabel: string) {
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch {
      throw new Error(`[${stepLabel}] 네트워크 오류 — 서버 연결 실패`);
    }
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const data = await res.json();
        if (data?.error) msg = data.error;
      } catch {
        try {
          const txt = await res.text();
          if (txt) msg = txt.slice(0, 200);
        } catch {
          /* ignore */
        }
      }
      throw new Error(`[${stepLabel}] ${msg}`);
    }
    return res;
  }

  async function startPipeline() {
    // 사전 검증: 두 키 모두 필요 (Anthropic 분석 + OpenAI Whisper 음성 인식)
    const apiKey = getStoredApiKey();
    const openaiKey = getStoredOpenAiKey();
    if (!apiKey) {
      setError('Anthropic API 키가 설정되지 않았습니다. 홈 화면에서 입력해주세요.');
      return;
    }
    if (!openaiKey) {
      setError('OpenAI API 키가 설정되지 않았습니다 (음성 인식용). 홈 화면에서 입력해주세요.');
      return;
    }

    setPhase('processing');
    setError('');
    try {
      await safeFetch(
        '/api/download',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: id }),
        },
        '영상 다운로드',
      );

      await safeFetch(
        '/api/transcribe',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: id, openaiApiKey: openaiKey }),
        },
        '음성 인식',
      );

      const anRes = await safeFetch(
        '/api/analyze',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
          body: JSON.stringify({ projectId: id, clipCount }),
        },
        'AI 분석',
      );
      const hookData = await anRes.json();

      setHooks(hookData);
      // 자동으로 모든 후킹 구간을 클립으로 생성 (사용자는 결과 먼저 확인)
      await handleGenerateClips(hookData);
      fetchProject();
    } catch (err) {
      setError(err instanceof Error ? err.message : '처리 중 오류 발생');
      setPhase('idle');
      fetchProject();
    }
  }

  /**
   * 편집 후 단일 클립만 재생성. 기존 clip의 id를 그대로 사용해서
   * 새 mp4가 같은 record를 덮어씌우게 함 → 클립 목록에 새 항목이 추가되지 않음.
   */
  async function regenerateSingleClip(
    hookIdx: number,
    updatedHook: HookSuggestion,
    originalHook: HookSuggestion,
  ) {
    setError('');
    // 기존 clip 찾기 우선순위:
    //  1. hook.id가 있으면 그 ID와 일치하는 clip (가장 정확)
    //  2. fallback: original.start_time과 가장 가까운 완성된 clip
    let matchedClip: Clip | undefined;
    if (originalHook.id) {
      matchedClip = clips.find((c) => c.id === originalHook.id);
    }
    if (!matchedClip) {
      const candidates = clips.filter((c) => c.status === 'complete');
      let bestDist = Infinity;
      for (const c of candidates) {
        const d = Math.abs(c.start_time - originalHook.start_time);
        if (d < bestDist) {
          bestDist = d;
          matchedClip = c;
        }
      }
    }
    // 클립별 customization 사용 — 다른 클립 영향 X
    const eff = (updatedHook.customization as ClipCustomization) || customization;
    const layoutForClip = updatedHook.layout || eff.layout;
    const x = layoutForClip === 'crop_vertical' ? eff.titleXCrop : eff.titleX;
    const y = layoutForClip === 'crop_vertical' ? eff.titleYCrop : eff.titleY;
    const hookWithId: HookSuggestion & {
      id?: string;
      titleX?: number;
      titleY?: number;
      customization?: ClipCustomization;
    } = {
      ...updatedHook,
      id: matchedClip?.id,
      layout: layoutForClip,
      titleX: x,
      titleY: y,
      // hook 전용 customization을 페이로드에 첨가 → clip route가 이걸 우선 사용
      customization: eff,
    };
    const payload = {
      projectId: id,
      selectedHooks: [hookWithId],
      layout: eff.layout,
      title: {
        fontName: eff.titleFontName,
        fontSize: eff.titleFontSize,
        color: eff.titleColor,
        bold: eff.titleBold,
        align: eff.titleAlign,
        x: eff.titleX,
        y: eff.titleY,
        boxWidth: eff.titleBoxWidth,
      },
      channel:
        eff.channelEnabled && eff.channelText.trim()
          ? {
              text: eff.channelText,
              fontName: eff.channelFontName,
              fontSize: eff.channelFontSize,
              color: eff.channelColor,
              bold: eff.channelBold,
              align: eff.channelAlign,
              x: eff.channelX,
              y: eff.channelY,
            }
          : undefined,
      bgZoom: eff.bgZoom,
      bgOffsetX: eff.bgOffsetX,
      bgOffsetY: eff.bgOffsetY,
      subtitle: eff.subtitleEnabled
        ? {
            fontName: eff.subtitleFontName,
            fontSize: eff.subtitleFontSize,
            color: eff.subtitleColor,
            bold: eff.subtitleBold,
            outlineEnabled: eff.subtitleOutlineEnabled,
            outlineColor: eff.subtitleOutlineColor,
            outlineWidth: eff.subtitleOutlineWidth,
            bgEnabled: eff.subtitleBgEnabled,
            bgColor: eff.subtitleBgColor,
            bgOpacity: eff.subtitleBgOpacity,
            y: eff.subtitleY,
            maxCharsPerLine: eff.subtitleMaxCharsPerLine ?? 13,
          }
        : undefined,
    };
    try {
      await safeFetch(
        '/api/clip',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
        '클립 재생성',
      );
      loadClips();
    } catch (err) {
      setError(err instanceof Error ? err.message : '클립 재생성 실패');
    }
    // hookIdx는 향후 디버깅용 (현재 미사용)
    void hookIdx;
  }

  async function handleGenerateClips(selected: HookSuggestion[]) {
    setPhase('generating_clips');
    setError('');

    try {
      // 각 hook의 customization 우선 사용 (없으면 전역 default). 결과: 클립별 다른 스타일.
      const hooksWithLayout = selected.map((h) => {
        const eff = (h.customization as ClipCustomization) || customization;
        const layout = h.layout || eff.layout;
        const x = layout === 'crop_vertical' ? eff.titleXCrop : eff.titleX;
        const y = layout === 'crop_vertical' ? eff.titleYCrop : eff.titleY;
        return {
          ...h,
          layout,
          titleX: x,
          titleY: y,
          // hook 전용 customization 첨가 → clip route가 hook별 다른 옵션 적용
          customization: eff,
        };
      });

      const payload = {
        projectId: id,
        selectedHooks: hooksWithLayout,
        layout: customization.layout, // 기본 fallback
        title: {
          fontName: customization.titleFontName,
          fontSize: customization.titleFontSize,
          color: customization.titleColor,
          bold: customization.titleBold,
          align: customization.titleAlign,
          // x, y는 hook별로 레이아웃에 맞게 전달됨
          x: customization.titleX,
          y: customization.titleY,
          boxWidth: customization.titleBoxWidth,
        },
        channel: customization.channelEnabled && customization.channelText.trim() ? {
          text: customization.channelText,
          fontName: customization.channelFontName,
          fontSize: customization.channelFontSize,
          color: customization.channelColor,
          bold: customization.channelBold,
          align: customization.channelAlign,
          x: customization.channelX,
          y: customization.channelY,
        } : undefined,
        bgZoom: customization.bgZoom,
        bgOffsetX: customization.bgOffsetX,
        bgOffsetY: customization.bgOffsetY,
        subtitle: customization.subtitleEnabled ? {
          fontName: customization.subtitleFontName,
          fontSize: customization.subtitleFontSize,
          color: customization.subtitleColor,
          bold: customization.subtitleBold,
          outlineEnabled: customization.subtitleOutlineEnabled,
          outlineColor: customization.subtitleOutlineColor,
          outlineWidth: customization.subtitleOutlineWidth,
          bgEnabled: customization.subtitleBgEnabled,
          bgColor: customization.subtitleBgColor,
          bgOpacity: customization.subtitleBgOpacity,
          y: customization.subtitleY,
          maxCharsPerLine: customization.subtitleMaxCharsPerLine ?? 13,
        } : undefined,
      };

      const res = await safeFetch(
        '/api/clip',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
        '클립 생성',
      );

      // 응답으로 받은 clipId를 hook에 매핑 → 단일 재생성 시 정확한 clip update 가능
      try {
        const results = (await res.json()) as Array<{
          clipId: string;
          outputPath: string;
          title: string;
        }>;
        if (Array.isArray(results) && results.length === selected.length) {
          setHooks((prev) =>
            prev.map((h, i) => ({
              ...h,
              ...(results[i]?.clipId ? { id: results[i].clipId } : {}),
            })),
          );
        }
      } catch {
        /* 응답 파싱 실패는 무시 (fallback: start_time 매칭) */
      }

      setPhase('complete');
      fetchProject();
      loadClips();
    } catch (err) {
      setError(err instanceof Error ? err.message : '클립 생성 중 오류 발생');
      // hooks가 있으면 select_hooks로, 없으면 idle로 (stuck 방지)
      setPhase(hooks.length > 0 ? 'select_hooks' : 'idle');
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#0a1428]">
      <header className="border-b border-[#1a2d4d] px-6 py-4 flex items-center gap-4 bg-[#0a1428]">
        <button
          onClick={() => router.push('/')}
          className="text-gray-600 hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold truncate">{project?.title || '프로젝트 로딩 중...'}</h1>
          {project?.duration && (
            <p className="text-sm text-gray-600">
              {Math.floor(project.duration / 60)}분 {Math.floor(project.duration % 60)}초
            </p>
          )}
        </div>
      </header>

      <main
        className={`flex-1 bg-[#0a1428] ${
          phase === 'complete' ? 'px-0 py-0' : 'px-6 py-8'
        }`}
      >
        <div
          className={`${
            phase === 'complete' ? 'w-full' : 'max-w-7xl mx-auto space-y-6'
          }`}
        >
          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          {phase === 'idle' && project?.status === 'created' && (
            <div className="flex flex-col items-center gap-6 py-10">
              <p className="text-gray-600 text-sm">{project.youtube_url}</p>

              {/* 클립 개수 선택 */}
              <div className="w-full max-w-md bg-[#11203d] rounded-lg border border-[#1a2d4d] p-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-semibold text-white">
                    생성할 쇼츠 개수
                  </label>
                  <span className="text-base font-bold text-[#4988C4]">
                    {clipCount}개
                  </span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={10}
                  step={1}
                  value={clipCount}
                  onChange={(e) => setClipCount(parseInt(e.target.value))}
                  className="w-full accent-[#4988C4]"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>1</span>
                  <span>5</span>
                  <span>10</span>
                </div>
                <p className="text-xs text-gray-500 mt-3 leading-relaxed">
                  AI가 영상에서 가장 후킹되는 구간을 이 개수만큼 추출합니다.
                  더 많을수록 분석 시간이 약간 더 걸려요.
                </p>
              </div>

              <button
                onClick={startPipeline}
                className="px-8 py-3 bg-[#1C4D8D] text-white rounded-lg font-medium hover:bg-[#0F2854] transition-colors"
              >
                분석 시작 ({clipCount}개 추출)
              </button>
            </div>
          )}

          {phase === 'processing' && (
            <div className="flex flex-col items-center gap-6 py-10">
              <ProgressTracker
                projectId={id}
                onComplete={() => { fetchProject(); loadHooks(); }}
                onError={(msg) => setError(msg)}
              />
            </div>
          )}

          {phase === 'select_hooks' && hooks.length > 0 && duration > 0 && (
            <HookSelector
              hooks={hooks}
              videoSrc={videoSrc}
              duration={duration}
              projectId={id}
              customization={customization}
              onCustomizationChange={setCustomization}
              onGenerate={handleGenerateClips}
              loading={false}
            />
          )}

          {phase === 'generating_clips' && (
            <div className="flex flex-col items-center gap-6 py-10">
              <ProgressTracker projectId={id} />
            </div>
          )}

          {/* 결과 + 편집 통합 화면: 좌측 사이드바 + 우측 편집 */}
          {phase === 'complete' && hooks.length > 0 && duration > 0 && (
            <div className="flex h-[calc(100vh-72px)]">
              <ClipSidebar
                clips={clips}
                hooks={hooks}
                selectedHookIdx={Math.min(selectedHookIdx, hooks.length - 1)}
                onSelectHook={setSelectedHookIdx}
                projectId={id}
                onRegenerateAll={() => {
                  if (!confirm('AI에게 다시 분석을 요청할까요?\n\n새로운 후킹 구간과 쇼츠가 생성됩니다.')) return;
                  startPipeline();
                }}
              />
              {hooks[selectedHookIdx] && (
                <div className="flex-1 min-w-0">
                  <ClipEditorV2
                    key={hooks[selectedHookIdx].id || selectedHookIdx}
                    projectId={id}
                    videoSrc={videoSrc}
                    onDownload={() => {
                      // 현재 hook과 매칭되는 clip의 mp4 다운로드
                      const hook = hooks[selectedHookIdx];
                      let matched = hook.id ? clips.find((c) => c.id === hook.id) : undefined;
                      if (!matched) {
                        let bestDist = Infinity;
                        for (const c of clips) {
                          const d =
                            Math.abs(c.start_time - hook.start_time) +
                            Math.abs(c.end_time - hook.end_time);
                          if (d < bestDist) {
                            bestDist = d;
                            matched = c;
                          }
                        }
                      }
                      if (matched?.id) {
                        triggerDownload(`/api/projects/download?clipId=${matched.id}`);
                      } else {
                        setError('다운로드할 클립을 찾을 수 없습니다. 재생성 후 다시 시도해주세요.');
                      }
                    }}
                    duration={duration}
                    startTime={hooks[selectedHookIdx].start_time}
                    endTime={hooks[selectedHookIdx].end_time}
                    title={hooks[selectedHookIdx].title}
                    hashtags={hooks[selectedHookIdx].suggested_hashtags}
                    layout={hooks[selectedHookIdx].layout}
                    transcript={transcript}
                    index={selectedHookIdx + 1}
                    reason={hooks[selectedHookIdx].reason}
                    onSave={(changes) => {
                      const idx = selectedHookIdx;
                      const original = hooks[idx];
                      if (!original) return;
                      const updatedHook: HookSuggestion = {
                        ...original,
                        start_time: changes.startTime,
                        end_time: changes.endTime,
                        title: changes.title,
                        suggested_hashtags: changes.hashtags,
                        layout: changes.layout,
                      };
                      const updatedHooks = hooks.map((h, i) => (i === idx ? updatedHook : h));
                      setHooks(updatedHooks);
                      // 해당 클립만 재생성 (전체 재생성 대신)
                      regenerateSingleClip(idx, updatedHook, original);
                    }}
                    // 클립별 customization: hook.customization 우선, 없으면 전역 default
                    customization={
                      (hooks[selectedHookIdx]?.customization as ClipCustomization) || customization
                    }
                    onCustomizationChange={(next) => {
                      // 현재 hook의 customization만 업데이트 — 다른 클립 영향 X
                      setHooks((prev) =>
                        prev.map((h, i) =>
                          i === selectedHookIdx ? { ...h, customization: next } : h,
                        ),
                      );
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {/* 후킹 선택 화면 — fallback (자동 클립 생성 실패 시) */}
          {phase === 'select_hooks' && hooks.length > 0 && duration > 0 && (
            <HookSelector
              hooks={hooks}
              videoSrc={videoSrc}
              duration={duration}
              projectId={id}
              customization={customization}
              onCustomizationChange={setCustomization}
              onGenerate={handleGenerateClips}
              loading={false}
            />
          )}
        </div>
      </main>
    </div>
  );
}
