'use client';

/**
 * Phase 4 — Timeline 편집 (in/out point 비주얼 드래그)
 *
 * 각 클립의 transcript segments를 가로 타임라인으로 표시하고, 시작/끝 marker를
 * 마우스 드래그로 조정. 5초 간격 grid + 키보드 단축키([, ])로 1초 단위 미세조정.
 *
 * 부모(clip-editor)에서 "고급 편집" 토글로 표시. 변경 시 onChange를 통해
 * draftStartTime / draftEndTime 만 갱신 — 실제 재생성은 기존 onSave 흐름에서 처리.
 *
 * 의존성 X — 새 API/ffmpeg/subtitle-gen 전혀 안 건드림.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Transcript } from '@/types';

interface Props {
  /** 영상 전체 길이 (초) */
  duration: number;
  /** 현재 in point (초) */
  startTime: number;
  /** 현재 out point (초) */
  endTime: number;
  /** transcript (segments 표시용; 없으면 빈 timeline) */
  transcript?: Transcript | null;
  /** 핸들 드래그 시 호출 */
  onChange: (next: { startTime: number; endTime: number }) => void;
  /** 사용자가 드래그를 완전히 끝낸 시점에 호출 (재생성 트리거용, 선택) */
  onCommit?: (next: { startTime: number; endTime: number }) => void;
  /** 최소 클립 길이 (default 2초) */
  minLength?: number;
  /** 표시 zoom (1=전체 보기, 2=2배 확대...). UI 미제공이지만 향후 확장 */
  zoom?: number;
}

function formatTime(s: number): string {
  if (!isFinite(s) || s < 0) return '0:00.0';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const ds = Math.floor((s % 1) * 10);
  return `${m}:${sec.toString().padStart(2, '0')}.${ds}`;
}

export function TimelineEditor({
  duration,
  startTime,
  endTime,
  transcript,
  onChange,
  onCommit,
  minLength = 2,
  zoom = 1,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<'start' | 'end' | null>(null);
  const lastValRef = useRef({ startTime, endTime });
  lastValRef.current = { startTime, endTime };

  const safeDur = Math.max(1, duration);
  const startPct = Math.max(0, Math.min(100, (startTime / safeDur) * 100));
  const endPct = Math.max(0, Math.min(100, (endTime / safeDur) * 100));

  const gridLines = useMemo(() => {
    const out: number[] = [];
    if (safeDur <= 0) return out;
    const step = 5;
    for (let t = 0; t <= safeDur; t += step) out.push(t);
    return out;
  }, [safeDur]);

  const segmentsToShow = useMemo(() => {
    if (!transcript?.segments) return [];
    return transcript.segments;
  }, [transcript]);

  const previewText = useMemo(() => {
    if (!transcript?.segments) return '';
    const inRange = transcript.segments.filter(
      (s) => s.end > startTime && s.start < endTime,
    );
    return inRange.map((s) => s.text).join(' ').trim();
  }, [transcript, startTime, endTime]);

  function clientXToTime(clientX: number): number {
    if (!trackRef.current) return 0;
    const rect = trackRef.current.getBoundingClientRect();
    const pct = (clientX - rect.left) / rect.width;
    return Math.max(0, Math.min(safeDur, pct * safeDur));
  }

  useEffect(() => {
    if (!dragging) return;
    function onMove(e: MouseEvent) {
      const t = clientXToTime(e.clientX);
      if (dragging === 'start') {
        const nextStart = Math.max(0, Math.min(t, lastValRef.current.endTime - minLength));
        onChange({ startTime: nextStart, endTime: lastValRef.current.endTime });
      } else if (dragging === 'end') {
        const nextEnd = Math.min(safeDur, Math.max(t, lastValRef.current.startTime + minLength));
        onChange({ startTime: lastValRef.current.startTime, endTime: nextEnd });
      }
    }
    function onUp() {
      const v = lastValRef.current;
      setDragging(null);
      onCommit?.({ startTime: v.startTime, endTime: v.endTime });
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging, safeDur, minLength]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tgt = e.target as HTMLElement | null;
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA')) return;
      const cur = lastValRef.current;
      if (e.key === '[') {
        e.preventDefault();
        const delta = e.shiftKey ? -1 : 1;
        const nextStart = Math.max(0, Math.min(cur.startTime + delta, cur.endTime - minLength));
        onChange({ startTime: nextStart, endTime: cur.endTime });
        onCommit?.({ startTime: nextStart, endTime: cur.endTime });
      } else if (e.key === ']') {
        e.preventDefault();
        const delta = e.shiftKey ? -1 : 1;
        const nextEnd = Math.min(safeDur, Math.max(cur.endTime + delta, cur.startTime + minLength));
        onChange({ startTime: cur.startTime, endTime: nextEnd });
        onCommit?.({ startTime: cur.startTime, endTime: nextEnd });
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeDur, minLength]);

  return (
    <div className="space-y-2 select-none">
      <div className="flex items-center justify-between text-[11px] text-gray-400 font-mono">
        <div className="flex items-center gap-2">
          <span className="text-white font-bold">{formatTime(startTime)}</span>
          <span className="text-gray-600">~</span>
          <span className="text-white font-bold">{formatTime(endTime)}</span>
          <span className="px-2 py-0.5 ml-1 bg-[#1C4D8D]/40 border border-[#4988C4]/50 rounded text-[#a5c7ef]">
            {(endTime - startTime).toFixed(1)}초
          </span>
        </div>
        <div className="text-gray-500 text-[10px]">
          단축키: <kbd className="px-1 bg-[#11203d] border border-[#243a5c] rounded">[</kbd> / <kbd className="px-1 bg-[#11203d] border border-[#243a5c] rounded">]</kbd> 1초 조정 (Shift = 뒤로)
        </div>
      </div>

      <div
        ref={trackRef}
        className="relative h-16 bg-[#0a1428] border border-[#243a5c] rounded overflow-hidden"
        style={{ minWidth: `${100 * zoom}%` }}
      >
        {gridLines.map((t) => (
          <div
            key={`grid-${t}`}
            className="absolute top-0 bottom-0 border-l border-[#1a2d4d]/60 pointer-events-none"
            style={{ left: `${(t / safeDur) * 100}%` }}
          >
            <span className="absolute top-0 left-0.5 text-[9px] text-gray-600 font-mono">
              {Math.round(t)}s
            </span>
          </div>
        ))}

        {segmentsToShow.map((seg, i) => {
          const left = (seg.start / safeDur) * 100;
          const width = ((seg.end - seg.start) / safeDur) * 100;
          if (width <= 0.05) return null;
          const inRange = seg.end > startTime && seg.start < endTime;
          return (
            <div
              key={`seg-${i}`}
              className={`absolute top-7 h-5 rounded-sm pointer-events-none border ${
                inRange
                  ? 'bg-[#4988C4]/35 border-[#4988C4]/60'
                  : 'bg-[#11203d] border-[#243a5c]'
              }`}
              style={{ left: `${left}%`, width: `${width}%` }}
              title={seg.text}
            />
          );
        })}

        <div
          className="absolute top-0 bottom-0 bg-[#4988C4]/15 ring-2 ring-[#4988C4] pointer-events-none z-10"
          style={{
            left: `${startPct}%`,
            width: `${Math.max(0, endPct - startPct)}%`,
          }}
        />

        <div
          className="absolute top-0 bottom-0 left-0 bg-black/50 pointer-events-none z-0"
          style={{ width: `${startPct}%` }}
        />
        <div
          className="absolute top-0 bottom-0 right-0 bg-black/50 pointer-events-none z-0"
          style={{ width: `${100 - endPct}%` }}
        />

        <div
          onMouseDown={(e) => {
            e.preventDefault();
            setDragging('start');
          }}
          className="absolute top-0 bottom-0 w-3 -translate-x-1/2 bg-[#4988C4] hover:bg-[#5aa3df] cursor-ew-resize z-20 flex items-center justify-center"
          style={{ left: `${startPct}%` }}
          title="시작점 드래그"
        >
          <div className="w-0.5 h-6 bg-white/80" />
        </div>

        <div
          onMouseDown={(e) => {
            e.preventDefault();
            setDragging('end');
          }}
          className="absolute top-0 bottom-0 w-3 -translate-x-1/2 bg-[#4988C4] hover:bg-[#5aa3df] cursor-ew-resize z-20 flex items-center justify-center"
          style={{ left: `${endPct}%` }}
          title="끝점 드래그"
        >
          <div className="w-0.5 h-6 bg-white/80" />
        </div>
      </div>

      {previewText && (
        <div className="bg-[#0a1428] border border-[#243a5c] rounded p-2 text-[11px] text-gray-300 max-h-20 overflow-y-auto leading-relaxed">
          <div className="text-[10px] text-gray-500 mb-1">선택 구간 자막 미리보기</div>
          {previewText}
        </div>
      )}
    </div>
  );
}
