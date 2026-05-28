'use client';

/**
 * Phase 4 — 채널 brand profile 관리자
 *
 * 로고/색/폰트/CTA를 한 번 저장하면 새 프로젝트에 자동 적용.
 * 활성화는 한 profile만 — radio 동작.
 *
 * Phase 1의 templates 테이블과는 별개로 운영 (default_template_id로 약하게 link).
 * ffmpeg/subtitle 등 렌더 코드는 손대지 않고 — 활성 profile은 별도 helper
 * `applyBrandOverlay()` (lib/brand-overlay.ts)에서 호출자에 의해 사용됨.
 */

import { useCallback, useEffect, useState } from 'react';

interface BrandProfile {
  id: string;
  name: string;
  logo_path: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  font_name: string | null;
  cta_text: string | null;
  default_template_id: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

const FONTS = ['Pretendard', 'Standard', 'Malgun Gothic', 'Nanum Gothic', 'Gulim'];

export function BrandProfileManager() {
  const [profiles, setProfiles] = useState<BrandProfile[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Partial<BrandProfile>>({});

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/brand-profiles');
      if (r.ok) setProfiles(await r.json());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function startCreate() {
    setCreating(true);
    setEditingId(null);
    setDraft({
      name: '',
      primary_color: '#4988C4',
      secondary_color: '#FFE600',
      font_name: 'Pretendard',
      cta_text: '구독+알림 설정 부탁드려요!',
    });
  }

  function startEdit(p: BrandProfile) {
    setEditingId(p.id);
    setCreating(false);
    setDraft({ ...p });
  }

  function cancelEdit() {
    setEditingId(null);
    setCreating(false);
    setDraft({});
  }

  async function saveCreate() {
    if (!draft.name?.trim()) {
      alert('이름을 입력해주세요.');
      return;
    }
    const r = await fetch('/api/brand-profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      alert(err.error || 'brand profile 생성 실패');
      return;
    }
    cancelEdit();
    load();
  }

  async function saveEdit() {
    if (!editingId) return;
    const r = await fetch(`/api/brand-profiles/${editingId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      alert(err.error || '수정 실패');
      return;
    }
    cancelEdit();
    load();
  }

  async function activate(id: string) {
    await fetch(`/api/brand-profiles/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activate: true }),
    });
    load();
  }

  async function remove(id: string, name: string) {
    if (!confirm(`brand profile "${name}"을 삭제할까요?`)) return;
    await fetch(`/api/brand-profiles/${id}`, { method: 'DELETE' });
    if (editingId === id) cancelEdit();
    load();
  }

  const active = profiles.find((p) => p.is_active === 1);

  return (
    <div className="w-full max-w-2xl rounded-lg border border-[#1a2d4d] bg-[#0a1428]">
      <div className="px-4 py-3">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <span className="text-sm">📈</span>
            <h3 className="text-sm font-semibold text-white">채널 Brand 프로필</h3>
            <span className="text-[10px] text-gray-500">(로고/색/CTA — 자동 적용)</span>
            {active && (
              <span className="text-[10px] px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded">
                활성: {active.name}
              </span>
            )}
          </div>
          {!creating && !editingId && (
            <button
              onClick={startCreate}
              className="px-2.5 py-1 bg-[#1C4D8D] text-white rounded text-xs font-medium hover:bg-[#0F2854]"
            >
              + 새 brand
            </button>
          )}
        </div>

        {!creating && !editingId && (
          <div className="space-y-1.5">
            {profiles.length === 0 && (
              <p className="text-gray-500 text-xs">
                아직 brand profile이 없습니다. 로고/색/폰트/CTA를 등록하면 새 프로젝트에 자동 적용돼요.
              </p>
            )}
            {profiles.map((p) => (
              <div
                key={p.id}
                className={`flex items-center gap-2 px-3 py-2 rounded border ${
                  p.is_active === 1
                    ? 'border-[#4988C4]/50 bg-[#1C4D8D]/15'
                    : 'border-[#243a5c] bg-[#11203d]'
                }`}
              >
                <input
                  type="radio"
                  checked={p.is_active === 1}
                  onChange={() => activate(p.id)}
                  className="accent-[#4988C4]"
                  title="활성화"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-white text-sm font-medium truncate">{p.name}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {p.primary_color && (
                      <span
                        className="inline-block w-3 h-3 rounded-sm border border-gray-700"
                        style={{ backgroundColor: p.primary_color }}
                        title={`primary ${p.primary_color}`}
                      />
                    )}
                    {p.secondary_color && (
                      <span
                        className="inline-block w-3 h-3 rounded-sm border border-gray-700"
                        style={{ backgroundColor: p.secondary_color }}
                        title={`secondary ${p.secondary_color}`}
                      />
                    )}
                    {p.font_name && <span className="text-[10px] text-gray-500">{p.font_name}</span>}
                    {p.cta_text && (
                      <span className="text-[10px] text-gray-500 truncate">&quot;{p.cta_text}&quot;</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => startEdit(p)}
                  className="px-2 py-1 text-xs text-gray-300 bg-[#11203d] border border-[#243a5c] rounded hover:bg-[#1a2d4d]"
                >
                  수정
                </button>
                <button
                  onClick={() => remove(p.id, p.name)}
                  className="px-2 py-1 text-xs text-gray-500 bg-[#11203d] border border-[#243a5c] rounded hover:text-red-400 hover:border-red-500/30"
                >
                  삭제
                </button>
              </div>
            ))}
          </div>
        )}

        {(creating || editingId) && (
          <div className="space-y-2 mt-2">
            <Field label="이름">
              <input
                type="text"
                value={draft.name || ''}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="예: 우리 채널 기본 brand"
                className="w-full px-2 py-1.5 bg-[#0a1428] border border-[#243a5c] rounded text-white text-sm focus:outline-none focus:border-[#4988C4]"
              />
            </Field>

            <Field label="로고 파일 경로 (선택)">
              <input
                type="text"
                value={draft.logo_path || ''}
                onChange={(e) => setDraft({ ...draft, logo_path: e.target.value })}
                placeholder="/Users/.../logo.png"
                className="w-full px-2 py-1.5 bg-[#0a1428] border border-[#243a5c] rounded text-white text-sm font-mono focus:outline-none focus:border-[#4988C4]"
              />
              <p className="text-[10px] text-gray-500 mt-0.5">
                PNG / WEBP 권장. 영상 우상단에 오버레이됩니다.
              </p>
            </Field>

            <div className="flex gap-2">
              <Field label="주 색상" className="flex-1">
                <div className="flex items-center gap-1.5">
                  <input
                    type="color"
                    value={draft.primary_color || '#4988C4'}
                    onChange={(e) => setDraft({ ...draft, primary_color: e.target.value })}
                    className="w-9 h-8 rounded border border-[#243a5c] bg-[#0a1428] cursor-pointer"
                  />
                  <input
                    type="text"
                    value={draft.primary_color || ''}
                    onChange={(e) => setDraft({ ...draft, primary_color: e.target.value })}
                    placeholder="#4988C4"
                    className="flex-1 px-2 py-1.5 bg-[#0a1428] border border-[#243a5c] rounded text-white text-sm font-mono"
                  />
                </div>
              </Field>
              <Field label="보조 색상" className="flex-1">
                <div className="flex items-center gap-1.5">
                  <input
                    type="color"
                    value={draft.secondary_color || '#FFE600'}
                    onChange={(e) => setDraft({ ...draft, secondary_color: e.target.value })}
                    className="w-9 h-8 rounded border border-[#243a5c] bg-[#0a1428] cursor-pointer"
                  />
                  <input
                    type="text"
                    value={draft.secondary_color || ''}
                    onChange={(e) => setDraft({ ...draft, secondary_color: e.target.value })}
                    placeholder="#FFE600"
                    className="flex-1 px-2 py-1.5 bg-[#0a1428] border border-[#243a5c] rounded text-white text-sm font-mono"
                  />
                </div>
              </Field>
            </div>

            <Field label="기본 폰트">
              <select
                value={draft.font_name || ''}
                onChange={(e) => setDraft({ ...draft, font_name: e.target.value })}
                className="w-full px-2 py-1.5 bg-[#0a1428] border border-[#243a5c] rounded text-white text-sm focus:outline-none focus:border-[#4988C4]"
              >
                <option value="">— 미지정 —</option>
                {FONTS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="CTA 문구 (영상 말미에 출력 — 선택)">
              <input
                type="text"
                value={draft.cta_text || ''}
                onChange={(e) => setDraft({ ...draft, cta_text: e.target.value })}
                placeholder="구독+알림 설정 부탁드려요!"
                className="w-full px-2 py-1.5 bg-[#0a1428] border border-[#243a5c] rounded text-white text-sm focus:outline-none focus:border-[#4988C4]"
              />
            </Field>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={cancelEdit}
                className="px-3 py-1.5 bg-[#11203d] border border-[#243a5c] text-gray-300 rounded text-xs hover:bg-[#1a2d4d]"
              >
                취소
              </button>
              <button
                onClick={creating ? saveCreate : saveEdit}
                className="px-3 py-1.5 bg-[#1C4D8D] text-white rounded text-xs font-medium hover:bg-[#0F2854]"
              >
                💾 저장
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-[11px] text-gray-400 mb-0.5">{label}</label>
      {children}
    </div>
  );
}
