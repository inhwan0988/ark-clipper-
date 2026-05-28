'use client';

import { useState, useRef, useEffect } from 'react';
import { ClipEditorV2 } from './clip-editor-v2';
import { HookPreviewCard } from './hook-preview-card';
import { TranscriptEditor } from './transcript-editor';
import { getStoredApiKey } from './api-key-settings';
import type { ClipCustomization } from './clip-customizer';
import type { HookSuggestion, Transcript } from '@/types';

interface HookSelectorProps {
  hooks: HookSuggestion[];
  videoSrc: string;
  duration: number;
  projectId: string;
  customization: ClipCustomization;
  onCustomizationChange: (c: ClipCustomization) => void;
  onGenerate: (selected: HookSuggestion[]) => void;
  loading: boolean;
}

export function HookSelector({
  hooks: initialHooks, videoSrc, duration, projectId,
  customization, onCustomizationChange,
  onGenerate, loading,
}: HookSelectorProps) {
  const [hooks, setHooks] = useState<HookSuggestion[]>(initialHooks);
  // AI가 제안한 원본 (되돌리기에 사용)
  const [originalHooks, setOriginalHooks] = useState<HookSuggestion[]>(() => initialHooks.map((h) => ({ ...h })));
  // 처음 들어왔을 때의 스타일 설정 원본 (되돌리기 시 같이 복원)
  const [originalCustomization] = useState<ClipCustomization>(() => ({ ...customization }));
  const [selected, setSelected] = useState<Set<number>>(new Set(initialHooks.map((_, i) => i)));
  const [focusedIdx, setFocusedIdx] = useState<number>(0);
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [reanalyzing, setReanalyzing] = useState(false);
  const carouselRef = useRef<HTMLDivElement>(null);

  // transcript 로드 (말자막 미리보기에 사용)
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/projects/transcript?projectId=${projectId}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data && data.segments) setTranscript(data);
      })
      .catch(() => { /* ignore */ });
    return () => { cancelled = true; };
  }, [projectId]);

  function toggle(index: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(hooks.map((_, i) => i)));
  }

  function deselectAll() {
    setSelected(new Set());
  }

  function saveHookChanges(idx: number, changes: {
    startTime: number;
    endTime: number;
    title: string;
    hashtags: string[];
    layout: 'letterbox' | 'crop_vertical' | 'custom_background';
  }) {
    setHooks((prev) => prev.map((h, i) => i === idx ? {
      ...h,
      start_time: changes.startTime,
      end_time: changes.endTime,
      title: changes.title,
      suggested_hashtags: changes.hashtags,
      layout: changes.layout,
    } : h));
  }

  // AI가 제안한 원본으로 되돌리기 (시간/제목/해시태그 + 스타일 설정 모두)
  function revertToOriginal(idx: number) {
    const orig = originalHooks[idx];
    if (!orig) return;
    setHooks((prev) => prev.map((h, i) => i === idx ? { ...orig } : h));
    // 스타일 설정도 처음 상태로 복원
    onCustomizationChange({ ...originalCustomization });
  }

  // AI 다시 분석하기 (전사 결과로 후킹 구간 + 제목 재생성)
  async function reanalyze() {
    if (reanalyzing) return;
    if (!confirm('AI에게 다시 분석을 요청할까요?\n\n새로운 후킹 구간과 제목이 생성되며, 현재 편집 중인 변경사항은 사라집니다.')) {
      return;
    }
    const apiKey = getStoredApiKey();
    if (!apiKey) {
      alert('API 키가 없습니다. 홈 화면에서 먼저 입력해주세요.');
      return;
    }

    setReanalyzing(true);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ projectId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || '재분석 실패');
      }
      const newHooks: HookSuggestion[] = await res.json();
      setHooks(newHooks);
      setOriginalHooks(newHooks.map((h) => ({ ...h })));
      setSelected(new Set(newHooks.map((_, i) => i)));
      setFocusedIdx(0);
    } catch (err) {
      alert(err instanceof Error ? err.message : '재분석 중 오류 발생');
    } finally {
      setReanalyzing(false);
    }
  }

  // 포커스된 카드를 카루셀 중앙에 보이게 스크롤
  useEffect(() => {
    const carousel = carouselRef.current;
    if (!carousel) return;
    const card = carousel.children[focusedIdx] as HTMLElement | undefined;
    if (!card) return;
    const carouselRect = carousel.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const offset = card.offsetLeft - (carouselRect.width - cardRect.width) / 2;
    carousel.scrollTo({ left: offset, behavior: 'smooth' });
  }, [focusedIdx]);

  function navigatePrev() {
    setFocusedIdx((prev) => Math.max(0, prev - 1));
  }
  function navigateNext() {
    setFocusedIdx((prev) => Math.min(hooks.length - 1, prev + 1));
  }

  // 키보드 네비게이션
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // input/textarea 포커스 시 무시
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); navigatePrev(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); navigateNext(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hooks.length]);

  const focusedHook = hooks[focusedIdx];

  return (
    <div className="w-full space-y-4">
      {/* 헤더 */}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-lg font-semibold text-white">
            AI 추천 후킹 구간 ({hooks.length}개)
          </h2>
          <div className="flex gap-1">
            <button
              onClick={selectAll}
              disabled={selected.size === hooks.length}
              className="px-2.5 py-1 bg-[#11203d] border border-[#243a5c] text-gray-300 rounded text-xs hover:bg-[#1a2d4d] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              전체 선택
            </button>
            <button
              onClick={deselectAll}
              disabled={selected.size === 0}
              className="px-2.5 py-1 bg-[#11203d] border border-[#243a5c] text-gray-300 rounded text-xs hover:bg-[#1a2d4d] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              전체 해제
            </button>
            <button
              onClick={reanalyze}
              disabled={reanalyzing || loading}
              className="px-2.5 py-1 bg-purple-600/20 border border-purple-500/40 text-purple-300 rounded text-xs hover:bg-purple-600/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
              title="새로운 후킹 구간과 제목을 AI가 다시 생성"
            >
              {reanalyzing ? (
                <>
                  <span className="inline-block w-3 h-3 border-2 border-purple-300 border-t-transparent rounded-full animate-spin" />
                  분석 중...
                </>
              ) : (
                <>🔄 AI 다시 분석</>
              )}
            </button>
          </div>
        </div>
        <button
          onClick={() => onGenerate(hooks.filter((_, i) => selected.has(i)))}
          disabled={loading || selected.size === 0 || reanalyzing}
          className="px-4 py-2 bg-[#1C4D8D] text-white rounded-lg text-sm font-medium hover:bg-[#0F2854] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? '생성 중...' : `선택된 ${selected.size}개 클립 생성`}
        </button>
      </div>

      {/* 가로 카루셀 */}
      <div className="relative">
        {/* 좌측 화살표 */}
        <button
          onClick={navigatePrev}
          disabled={focusedIdx === 0}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 bg-[#0a1428]/80 border border-[#243a5c] rounded-full text-white hover:bg-[#1a2d4d] disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center backdrop-blur shadow-lg"
          aria-label="이전 영상"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {/* 우측 화살표 */}
        <button
          onClick={navigateNext}
          disabled={focusedIdx === hooks.length - 1}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 bg-[#0a1428]/80 border border-[#243a5c] rounded-full text-white hover:bg-[#1a2d4d] disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center backdrop-blur shadow-lg"
          aria-label="다음 영상"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>

        {/* 카루셀 컨테이너 */}
        <div
          ref={carouselRef}
          className="flex gap-3 overflow-x-auto px-12 py-3 snap-x snap-mandatory scroll-smooth"
          style={{ scrollbarWidth: 'thin' }}
        >
          {hooks.map((hook, i) => (
            <div key={i} className="snap-center">
              <HookPreviewCard
                videoSrc={videoSrc}
                startTime={hook.start_time}
                endTime={hook.end_time}
                title={hook.title}
                customization={{ ...customization, layout: hook.layout || customization.layout }}
                selected={selected.has(i)}
                focused={focusedIdx === i}
                confidence={hook.confidence}
                index={i}
                onSelect={() => toggle(i)}
                onFocus={() => setFocusedIdx(i)}
                onToggle={() => toggle(i)}
                viralityScore={hook.virality_score}
                predictedReach={hook.predicted_reach}
                viralityReasons={hook.virality_reasons}
              />
            </div>
          ))}
        </div>

        {/* 페이지 인디케이터 */}
        <div className="flex justify-center gap-1.5 mt-2">
          {hooks.map((_, i) => (
            <button
              key={i}
              onClick={() => setFocusedIdx(i)}
              className={`h-1.5 rounded-full transition-all ${
                focusedIdx === i ? 'w-6 bg-[#4988C4]' : 'w-1.5 bg-[#243a5c] hover:bg-zinc-600'
              }`}
              aria-label={`${i + 1}번째 영상`}
            />
          ))}
        </div>
      </div>

      {/* 상세 편집기 (포커스된 후킹 구간) — 헤더는 ClipEditorV2 내부에 통합됨 */}
      {focusedHook && (
        <div className="space-y-2">
          <ClipEditorV2
            key={focusedIdx}
            videoSrc={videoSrc}
            duration={duration}
            startTime={focusedHook.start_time}
            endTime={focusedHook.end_time}
            title={focusedHook.title}
            hashtags={focusedHook.suggested_hashtags}
            layout={focusedHook.layout}
            transcript={transcript}
            index={focusedIdx + 1}
            reason={focusedHook.reason}
            onSave={(changes) => saveHookChanges(focusedIdx, changes)}
            onRevert={() => revertToOriginal(focusedIdx)}
            customization={customization}
            onCustomizationChange={onCustomizationChange}
          />

          {/* 자막 수정 (전체 transcript 편집, 클립 생성 시 반영) */}
          {transcript && transcript.segments.length > 0 && (
            <div className="mt-4">
              <TranscriptEditor
                projectId={projectId}
                transcript={transcript}
                onSaved={(updated) => setTranscript(updated)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
