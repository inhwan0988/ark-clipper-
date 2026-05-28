'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { ClipCustomization } from './clip-customizer';
import type { Template } from '@/types';

interface Props {
  /** 현재 customization 상태 — "저장" 시 그대로 dump */
  current: ClipCustomization;
  /** 사용자가 템플릿을 선택했을 때 호출. 현재 customization을 통째로 갈아끼움. */
  onApply: (next: ClipCustomization) => void;
}

/**
 * 자막+타이틀+채널+layout 등 ClipCustomization 전체를 프리셋으로 저장/불러오기.
 *
 * 사용: 프로젝트 페이지 상단에 "템플릿 ▼" dropdown + "현재 설정 저장" 버튼.
 *  - dropdown 항목 클릭 → 현재 customization에 적용
 *  - 우측 🗑 → 해당 템플릿 삭제
 *  - "저장" 버튼 → 이름 prompt → DB 저장
 */
export function TemplateManager({ current, onApply }: Props) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const reload = useCallback(async () => {
    try {
      const res = await fetch('/api/templates');
      if (res.ok) {
        const list = (await res.json()) as Template[];
        setTemplates(Array.isArray(list) ? list : []);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // 외부 클릭 시 dropdown 닫기
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  async function saveCurrent() {
    setError('');
    const name = (window.prompt('템플릿 이름을 입력하세요', '') || '').trim();
    if (!name) return;
    setBusy(true);
    try {
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, settings: { customization: current, version: 1 } }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장 실패');
    } finally {
      setBusy(false);
    }
  }

  function applyTemplate(t: Template) {
    setError('');
    try {
      const parsed = JSON.parse(t.settings) as { customization?: ClipCustomization };
      if (parsed && parsed.customization && typeof parsed.customization === 'object') {
        onApply(parsed.customization);
        setOpen(false);
      } else {
        throw new Error('settings에 customization 필드가 없습니다.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '템플릿 적용 실패');
    }
  }

  async function deleteTemplate(t: Template, e: React.MouseEvent) {
    e.stopPropagation();
    if (!window.confirm(`템플릿 "${t.name}"을 삭제할까요?`)) return;
    setError('');
    setBusy(true);
    try {
      const res = await fetch(`/api/templates/${t.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : '삭제 실패');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2" ref={wrapRef}>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={busy}
          className="px-3 py-1.5 text-xs bg-[#1a2d4d] text-gray-200 border border-[#243a5c] rounded hover:bg-[#243a5c] transition flex items-center gap-1.5"
        >
          <span>템플릿</span>
          <span className="text-[10px] opacity-60">{templates.length}</span>
          <svg className="w-3 h-3 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {open && (
          <div className="absolute right-0 top-full mt-1 w-64 max-h-72 overflow-y-auto bg-[#11203d] border border-[#243a5c] rounded shadow-lg z-50">
            {templates.length === 0 ? (
              <div className="px-3 py-3 text-xs text-gray-500">
                저장된 템플릿이 없습니다.<br />아래 &quot;저장&quot; 버튼으로 현재 설정을 저장하세요.
              </div>
            ) : (
              templates.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between px-3 py-2 hover:bg-[#1a2d4d] cursor-pointer group"
                  onClick={() => applyTemplate(t)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-white font-medium truncate">{t.name}</div>
                    <div className="text-[10px] text-gray-500 truncate">
                      {new Date(t.updated_at).toLocaleString('ko-KR')}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => deleteTemplate(t, e)}
                    className="ml-2 px-1.5 py-1 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition"
                    title="삭제"
                    aria-label="삭제"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3"
                      />
                    </svg>
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={saveCurrent}
        disabled={busy}
        className="px-3 py-1.5 text-xs bg-[#1C4D8D] text-white rounded hover:bg-[#0F2854] transition disabled:opacity-50"
      >
        현재 설정 저장
      </button>
      {error && (
        <div className="text-[11px] text-red-400 max-w-xs truncate" title={error}>
          {error}
        </div>
      )}
    </div>
  );
}
