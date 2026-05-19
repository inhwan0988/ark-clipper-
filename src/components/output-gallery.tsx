'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Clip, HookSuggestion } from '@/types';

interface OutputGalleryProps {
  clips: Clip[];
  projectId: string;
  /** 클립 ↔ hook 매칭에 사용 (start_time 기준) */
  hooks?: HookSuggestion[];
  /** 선택된 클립의 hook 인덱스를 받아 풀 화면 편집 진입 */
  onEditClip?: (hookIdx: number) => void;
  onRegenerate?: () => void;
}

export function OutputGallery({
  clips,
  projectId,
  hooks,
  onEditClip,
  onRegenerate,
}: OutputGalleryProps) {
  const completedClips = clips.filter((c) => c.status === 'complete');
  const [selectedClipId, setSelectedClipId] = useState<string | null>(
    completedClips[0]?.id ?? null,
  );

  // 클립 리스트 갱신 시 선택 유지 (없으면 첫 번째)
  useEffect(() => {
    if (
      completedClips.length > 0 &&
      (!selectedClipId || !completedClips.find((c) => c.id === selectedClipId))
    ) {
      setSelectedClipId(completedClips[0].id);
    }
  }, [completedClips, selectedClipId]);

  // 캐시 회피용 cache-bust 키: clips 배열이 변경(편집 후 재생성 등)될 때마다 새 값
  // → video element가 같은 path여도 새 URL로 인식해 mp4를 다시 로드
  // (Hooks rules: 모든 hook은 early return 이전에 호출되어야 함)
  const cacheKey = useMemo(
    () =>
      clips
        .map(
          (c) =>
            `${c.id}:${c.status}:${c.start_time}:${c.end_time}:${c.title ?? ''}`,
        )
        .join('|'),
    [clips],
  );
  const cacheBust = useMemo(() => {
    let h = 0;
    for (let i = 0; i < cacheKey.length; i++) {
      h = (h * 31 + cacheKey.charCodeAt(i)) >>> 0;
    }
    return h.toString(36);
  }, [cacheKey]);

  // 클립이 0개인 경우 — 빈 상태 UI (생성 실패/처리 중 등)
  if (completedClips.length === 0) {
    const totalClips = clips.length;
    const errorClips = clips.filter((c) => c.status === 'error').length;
    const processingClips = clips.filter(
      (c) => c.status === 'processing' || c.status === 'pending',
    ).length;
    return (
      <div className="w-full py-16 flex flex-col items-center gap-4 text-center">
        <div className="text-5xl">🎬</div>
        <div className="text-lg font-semibold text-white">
          아직 완성된 쇼츠가 없습니다
        </div>
        <div className="text-sm text-gray-400 max-w-md">
          {totalClips === 0 ? (
            <>클립이 생성되지 않았습니다. 재생성 버튼을 눌러 다시 시도해주세요.</>
          ) : processingClips > 0 ? (
            <>{processingClips}개 클립 생성 중... 잠시만 기다려주세요.</>
          ) : errorClips > 0 ? (
            <>
              {errorClips}개 클립 생성에 실패했습니다. 재생성을 시도하거나
              API 키와 영상 파일을 확인해주세요.
            </>
          ) : (
            <>클립 정보를 불러오는 중...</>
          )}
        </div>
        {onRegenerate && (
          <button
            onClick={onRegenerate}
            className="mt-2 px-5 py-2.5 bg-[#1C4D8D] text-white rounded-lg text-sm font-medium hover:bg-[#0F2854] transition"
          >
            🔄 재생성하기
          </button>
        )}
      </div>
    );
  }

  const selectedClip =
    completedClips.find((c) => c.id === selectedClipId) ?? completedClips[0];

  function downloadOne(clipId: string) {
    window.location.href = `/api/projects/download?clipId=${clipId}`;
  }

  function downloadAll() {
    window.location.href = `/api/projects/download-zip?projectId=${projectId}`;
  }

  function openFolder() {
    fetch('/api/projects/open-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId }),
    });
  }

  // clip → hook 인덱스 매칭
  //  1순위: hook.id === clip.id (가장 정확. 첫 생성 후 hook에 clipId 매핑됨)
  //  2순위: (start_time, end_time) 둘 다 가장 가까운 hook (start만 비교하면
  //         같은 0:00에서 시작하는 두 클립을 구분 못 함)
  function findHookIdxForClip(clip: Clip): number | null {
    if (!hooks || hooks.length === 0) return null;
    const byId = hooks.findIndex((h) => h.id && h.id === clip.id);
    if (byId >= 0) return byId;
    let bestIdx = 0;
    let bestDiff =
      Math.abs(hooks[0].start_time - clip.start_time) +
      Math.abs(hooks[0].end_time - clip.end_time);
    for (let i = 1; i < hooks.length; i++) {
      const diff =
        Math.abs(hooks[i].start_time - clip.start_time) +
        Math.abs(hooks[i].end_time - clip.end_time);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIdx = i;
      }
    }
    return bestIdx;
  }

  function handleEditClip(clip: Clip) {
    if (!onEditClip) return;
    const idx = findHookIdxForClip(clip);
    if (idx !== null) onEditClip(idx);
  }

  function videoUrl(clip: Clip): string {
    if (!clip.output_path) return '';
    return `/api/projects/video?path=${encodeURIComponent(clip.output_path)}&v=${cacheBust}`;
  }

  return (
    <div className="w-full">
      {/* 상단 액션 — 선택된 클립 + 전체 액션 통합 */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <h2 className="text-xl font-bold text-white">
          🎬 생성된 쇼츠{' '}
          <span className="text-gray-500">({completedClips.length}개)</span>
        </h2>
        <div className="flex flex-wrap gap-2">
          {/* 선택된 클립 액션 */}
          {selectedClip && (
            <>
              <button
                onClick={() => downloadOne(selectedClip.id)}
                className="px-4 py-2 bg-[#1C4D8D] text-white rounded-lg text-sm font-medium hover:bg-[#0F2854] transition flex items-center gap-1.5"
              >
                📥 MP4 다운로드
              </button>
              {onEditClip && (
                <button
                  onClick={() => handleEditClip(selectedClip)}
                  className="px-4 py-2 bg-[#11203d] border border-[#243a5c] text-gray-100 rounded-lg text-sm font-medium hover:bg-[#1a2d4d] transition flex items-center gap-1.5"
                >
                  ✏️ 이 쇼츠 편집
                </button>
              )}
              <div className="w-px bg-[#243a5c] mx-1" />
            </>
          )}
          {/* 전체 액션 */}
          {onRegenerate && (
            <button
              onClick={onRegenerate}
              className="px-4 py-2 bg-[#1C4D8D] text-white rounded-lg text-sm font-medium hover:bg-[#0F2854] transition flex items-center gap-1.5"
            >
              🔄 재생성
            </button>
          )}
          <button
            onClick={downloadAll}
            className="px-4 py-2 bg-[#1C4D8D] text-white rounded-lg text-sm font-medium hover:bg-[#0F2854] transition flex items-center gap-1.5"
          >
            📥 전체 ZIP 다운로드
          </button>
          <button
            onClick={openFolder}
            className="px-3 py-2 bg-[#11203d] border border-[#243a5c] text-gray-600 rounded-lg text-sm hover:bg-[#1a2d4d] transition"
          >
            📁 폴더 열기
          </button>
        </div>
      </div>

      {/* 좌측 리스트 + 중앙 미리보기 */}
      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4">
        {/* 좌측 — 클립 리스트 */}
        <div className="space-y-2 max-h-[640px] overflow-y-auto pr-1">
          {completedClips.map((clip, idx) => {
            const isSelected = clip.id === selectedClipId;
            return (
              <div
                key={clip.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedClipId(clip.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedClipId(clip.id);
                  }
                }}
                className={`w-full text-left p-3 rounded-lg border transition flex gap-3 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#4988C4] ${
                  isSelected
                    ? 'border-[#4988C4] bg-[#4988C4]/10'
                    : 'border-[#1a2d4d] bg-[#11203d] hover:border-[#243a5c] hover:bg-[#243a5c]/40'
                }`}
              >
                <div className="w-16 aspect-[9/16] rounded bg-[#0a1428] overflow-hidden shrink-0 relative">
                  {clip.output_path && (
                    <video
                      key={`thumb-${clip.id}-${cacheBust}`}
                      src={videoUrl(clip)}
                      className="w-full h-full object-cover"
                      preload="metadata"
                      muted
                    />
                  )}
                  <span className="absolute top-1 left-1 text-[10px] font-bold bg-[#0a1428]/60 text-white px-1.5 py-0.5 rounded">
                    {idx + 1}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-sm font-medium line-clamp-2 leading-snug ${
                      isSelected ? 'text-[#4988C4]' : 'text-white'
                    }`}
                  >
                    {clip.title || `클립 ${idx + 1}`}
                  </p>
                  <p className="text-[11px] text-gray-500 mt-1">
                    {formatTime(clip.start_time)} ~ {formatTime(clip.end_time)}
                    {' · '}
                    {Math.round(clip.end_time - clip.start_time)}초
                  </p>
                  <div className="mt-2 flex gap-1.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        downloadOne(clip.id);
                      }}
                      className="text-[11px] px-2 py-1 bg-[#1a2d4d] text-gray-300 rounded hover:bg-[#243a5c]"
                    >
                      📥 다운로드
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* 중앙 — 미리보기 */}
        {selectedClip && (
          <div className="bg-[#0a1428] rounded-lg border border-[#1a2d4d] overflow-hidden flex flex-col">
            <div className="bg-[#0a1428] flex items-center justify-center" style={{ minHeight: '400px' }}>
              {selectedClip.output_path && (
                <video
                  key={`main-${selectedClip.id}-${cacheBust}`}
                  src={videoUrl(selectedClip)}
                  className="max-h-[640px] w-auto"
                  controls
                  autoPlay
                />
              )}
            </div>
            <div className="p-4 border-t border-[#1a2d4d] space-y-2">
              <h3 className="text-base font-bold text-white">
                {selectedClip.title || `클립`}
              </h3>
              <div className="flex items-center gap-3 text-xs text-gray-600">
                <span>
                  ⏱ {formatTime(selectedClip.start_time)} ~{' '}
                  {formatTime(selectedClip.end_time)}
                </span>
                <span>
                  📏 {Math.round(selectedClip.end_time - selectedClip.start_time)}초
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
