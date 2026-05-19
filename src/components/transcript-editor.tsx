'use client';

import { useEffect, useState } from 'react';
import type { Transcript, TranscriptSegment } from '@/types';

interface Props {
  projectId: string;
  transcript: Transcript;
  onSaved?: (updated: Transcript) => void;
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export function TranscriptEditor({ projectId, transcript, onSaved }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [drafts, setDrafts] = useState<string[]>(() =>
    transcript.segments.map((s) => s.text),
  );
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // transcript가 외부에서 변경되면 draft 갱신
  useEffect(() => {
    setDrafts(transcript.segments.map((s) => s.text));
    setSavedAt(null);
  }, [transcript]);

  const isDirty = drafts.some((t, i) => t !== transcript.segments[i]?.text);

  function updateDraft(idx: number, value: string) {
    setDrafts((prev) => {
      const next = [...prev];
      next[idx] = value;
      return next;
    });
  }

  function resetAll() {
    if (!confirm('수정한 자막을 모두 원래대로 되돌릴까요?')) return;
    setDrafts(transcript.segments.map((s) => s.text));
  }

  async function save() {
    if (!isDirty || saving) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        projectId,
        segments: drafts.map((text, i) => ({
          start: transcript.segments[i].start,
          end: transcript.segments[i].end,
          text,
        })),
      };
      const res = await fetch('/api/projects/transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? '저장 실패');
      }

      const updated: Transcript = {
        ...transcript,
        segments: transcript.segments.map((seg, i) => ({
          ...seg,
          text: drafts[i],
        })) as TranscriptSegment[],
      };
      onSaved?.(updated);
      setSavedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 중 오류');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-[#11203d] rounded-lg border border-[#1a2d4d] overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-[#243a5c]/40 transition-colors"
      >
        <div className="flex items-center gap-3">
          <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
          <span className="text-white text-sm font-medium">자막 수정</span>
          <span className="text-gray-500 text-xs">
            ({transcript.segments.length}개 구간)
          </span>
          {isDirty && (
            <span className="text-[10px] px-1.5 py-0.5 bg-orange-500/20 text-orange-400 rounded">
              변경됨
            </span>
          )}
          {savedAt && !isDirty && (
            <span className="text-[10px] px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded">
              저장됨
            </span>
          )}
        </div>
        <svg
          className={`w-4 h-4 text-gray-600 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-[#1a2d4d]">
          <div className="px-4 py-3 bg-[#0a1428]/50 border-b border-[#1a2d4d]">
            <p className="text-gray-600 text-xs leading-relaxed">
              AI가 자동 인식한 자막입니다. 어색하거나 잘못 들린 부분을 수정한 뒤
              저장하면, 이후 생성되는 모든 쇼츠에 반영됩니다.
              <br />
              <span className="text-gray-500">
                ※ 시간 정보는 변경되지 않습니다. 텍스트만 수정해주세요.
              </span>
            </p>
          </div>

          <div className="max-h-96 overflow-y-auto px-4 py-3 space-y-2">
            {transcript.segments.map((seg, i) => (
              <div
                key={i}
                className="flex items-start gap-3 py-1.5 border-b border-[#1a2d4d]/50 last:border-b-0"
              >
                <span className="shrink-0 w-16 text-[11px] font-mono text-gray-500 pt-2">
                  {formatTime(seg.start)}
                </span>
                <textarea
                  value={drafts[i] ?? ''}
                  onChange={(e) => updateDraft(i, e.target.value)}
                  rows={1}
                  className={`flex-1 bg-[#0a1428] border rounded px-2.5 py-1.5 text-sm text-white resize-y focus:outline-none focus:border-[#4988C4] ${
                    drafts[i] !== seg.text
                      ? 'border-orange-500/50'
                      : 'border-[#1a2d4d]'
                  }`}
                />
              </div>
            ))}
          </div>

          {error && (
            <div className="px-4 py-2 bg-red-500/10 border-t border-red-500/20 text-red-400 text-xs">
              {error}
            </div>
          )}

          <div className="px-4 py-3 bg-[#0a1428]/50 border-t border-[#1a2d4d] flex items-center justify-between gap-2">
            <button
              onClick={resetAll}
              disabled={!isDirty || saving}
              className="px-3 py-1.5 bg-[#11203d] border border-[#243a5c] text-gray-600 rounded text-xs hover:bg-[#1a2d4d] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ↩️ 모두 원래대로
            </button>
            <button
              onClick={save}
              disabled={!isDirty || saving}
              className="px-4 py-1.5 bg-[#1C4D8D] text-white rounded text-xs font-medium hover:bg-[#0F2854] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? '저장 중...' : '💾 자막 저장'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
