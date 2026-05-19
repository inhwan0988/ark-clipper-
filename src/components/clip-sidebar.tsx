'use client';

import { useMemo } from 'react';
import type { Clip, HookSuggestion } from '@/types';

interface Props {
  clips: Clip[];
  hooks: HookSuggestion[];
  selectedHookIdx: number;
  onSelectHook: (idx: number) => void;
  onRegenerateAll: () => void;
  projectId: string;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function ClipSidebar({
  clips,
  hooks,
  selectedHookIdx,
  onSelectHook,
  onRegenerateAll,
  projectId,
}: Props) {
  // cache-bust: clips가 변경(재생성)되면 비디오 강제 reload
  const cacheBust = useMemo(() => {
    const key = clips
      .map((c) => `${c.id}:${c.status}:${c.start_time}:${c.end_time}:${c.title ?? ''}`)
      .join('|');
    let h = 0;
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }, [clips]);

  // hook → clip 매칭 (clip.id === hook.id 우선, fallback start/end)
  function clipForHook(h: HookSuggestion): Clip | undefined {
    if (h.id) {
      const byId = clips.find((c) => c.id === h.id);
      if (byId) return byId;
    }
    let best: Clip | undefined;
    let bestDist = Infinity;
    for (const c of clips) {
      const d = Math.abs(c.start_time - h.start_time) + Math.abs(c.end_time - h.end_time);
      if (d < bestDist) {
        bestDist = d;
        best = c;
      }
    }
    return best;
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
  function downloadOne(clipId: string) {
    window.location.href = `/api/projects/download?clipId=${clipId}`;
  }

  return (
    <aside className="w-[280px] shrink-0 flex flex-col bg-[#0a1428] border-r border-[#1a2d4d]">
      {/* 상단 헤더 + 액션 */}
      <div className="p-3 border-b border-[#1a2d4d] space-y-2">
        <h2 className="text-sm font-bold text-white">
          🎬 쇼츠 <span className="text-gray-500">({hooks.length}개)</span>
        </h2>
        <div className="flex flex-col gap-1.5">
          <button
            onClick={onRegenerateAll}
            className="px-2.5 py-1.5 bg-[#11203d] hover:bg-[#1a2d4d] border border-[#243a5c] text-gray-200 rounded text-xs flex items-center justify-center gap-1.5"
            title="모든 쇼츠 다시 만들기"
          >
            🔄 전체 재생성
          </button>
          <div className="flex gap-1">
            <button
              onClick={downloadAll}
              className="flex-1 px-2 py-1.5 bg-[#1C4D8D] hover:bg-[#0F2854] text-white rounded text-xs"
              title="전체 ZIP 다운로드"
            >
              📥 ZIP
            </button>
            <button
              onClick={openFolder}
              className="flex-1 px-2 py-1.5 bg-[#11203d] hover:bg-[#1a2d4d] border border-[#243a5c] text-gray-300 rounded text-xs"
              title="파일 폴더 열기"
            >
              📁 폴더
            </button>
          </div>
        </div>
      </div>

      {/* 클립 카드 리스트 */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {hooks.map((hook, idx) => {
          const clip = clipForHook(hook);
          const isSelected = idx === selectedHookIdx;
          const isComplete = clip?.status === 'complete' && clip.output_path;
          const isProcessing = clip?.status === 'processing' || clip?.status === 'pending';
          const isError = clip?.status === 'error';
          return (
            <div
              key={idx}
              role="button"
              tabIndex={0}
              onClick={() => onSelectHook(idx)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectHook(idx);
                }
              }}
              className={`p-2 rounded-lg border cursor-pointer transition flex gap-2 focus:outline-none focus:ring-2 focus:ring-[#4988C4] ${
                isSelected
                  ? 'border-[#4988C4] bg-[#4988C4]/10'
                  : 'border-[#1a2d4d] bg-[#11203d] hover:border-[#243a5c] hover:bg-[#243a5c]/40'
              }`}
            >
              {/* 썸네일 */}
              <div className="w-14 aspect-[9/16] rounded bg-[#0a1428] overflow-hidden shrink-0 relative">
                {isComplete && clip?.output_path && (
                  <video
                    key={`${clip.id}-${cacheBust}`}
                    src={`/api/projects/video?path=${encodeURIComponent(clip.output_path)}&v=${cacheBust}`}
                    className="w-full h-full object-cover"
                    preload="metadata"
                    muted
                  />
                )}
                {isProcessing && (
                  <div className="absolute inset-0 flex items-center justify-center text-[9px] text-gray-400">
                    처리중
                  </div>
                )}
                {isError && (
                  <div className="absolute inset-0 flex items-center justify-center text-[9px] text-red-400">
                    실패
                  </div>
                )}
                <span className="absolute top-0.5 left-0.5 text-[9px] font-bold bg-[#0a1428]/70 text-white px-1 rounded">
                  {idx + 1}
                </span>
              </div>

              {/* 정보 */}
              <div className="flex-1 min-w-0">
                <p
                  className={`text-xs font-medium line-clamp-2 leading-snug ${
                    isSelected ? 'text-[#4988C4]' : 'text-white'
                  }`}
                >
                  {hook.title}
                </p>
                <p className="text-[10px] text-gray-500 mt-0.5">
                  {formatTime(hook.start_time)} ~ {formatTime(hook.end_time)}
                  {' · '}
                  {Math.round(hook.end_time - hook.start_time)}초
                </p>
                {isComplete && clip && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      downloadOne(clip.id);
                    }}
                    className="mt-1 text-[10px] px-2 py-1 bg-[#1C4D8D] hover:bg-[#0F2854] text-white rounded flex items-center gap-1"
                    title="이 쇼츠 MP4 다운로드"
                  >
                    📥 다운로드
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
