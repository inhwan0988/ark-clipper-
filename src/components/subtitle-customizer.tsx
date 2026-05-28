'use client';

import { useState } from 'react';
import { TEMPLATES } from '@/lib/subtitle-templates';

export interface SubtitleStyle {
  templateId: string;
  fontName: string;
  fontSize: number;
  primaryColor: string;
  outlineColor: string;
  bold: boolean;
  // [Phase 3 / Task 4] 자막 애니메이션
  animation?: 'none' | 'typewriter' | 'bounce' | 'wave';
  // [Phase 3 / Task 3] BGM
  bgmEnabled?: boolean;
  bgmPath?: string;
  bgmVolume?: number;
  // [Phase 3 / Task 2] B-roll (Pexels)
  brollEnabled?: boolean;
  brollApiKey?: string;
  // Phase 2 — 강조 단어 highlight
  /** 강조 단어 색 (6자리 hex, # 없이). default 'FFE600' */
  emphasisColor?: string;
  /** 강조 단어 크기 배율 % (default 130) */
  emphasisScale?: number;
  // Phase 2 — emoji 자동
  /** emoji 자동 삽입 on/off (default true) */
  emojiEnabled?: boolean;
  /** emoji 위치 (default 'end') */
  emojiPlacement?: 'inline' | 'end';
}

interface SubtitleCustomizerProps {
  value: SubtitleStyle;
  onChange: (style: SubtitleStyle) => void;
}

const FONTS = ['Pretendard', 'Noto Sans KR', 'Nanum Gothic', 'Malgun Gothic', 'Spoqa Han Sans Neo'];

const PRESET_COLORS = [
  { name: '흰색', hex: 'FFFFFF' },
  { name: '노랑', hex: 'FFEB3B' },
  { name: '연두', hex: 'B6FF59' },
  { name: '하늘', hex: '40C4FF' },
  { name: '핑크', hex: 'FF80AB' },
  { name: '주황', hex: 'FF9100' },
  { name: '검정', hex: '000000' },
];

export function SubtitleCustomizer({ value, onChange }: SubtitleCustomizerProps) {
  const [expanded, setExpanded] = useState(false);

  function update(patch: Partial<SubtitleStyle>) {
    onChange({ ...value, ...patch });
  }

  return (
    <div className="bg-[#11203d] rounded-lg border border-[#1a2d4d] overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-[#243a5c]/40 transition-colors"
      >
        <div className="flex items-center gap-3">
          <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
          </svg>
          <span className="text-white text-sm font-medium">자막 스타일</span>
          <span className="text-gray-500 text-xs">
            {TEMPLATES.find((t) => t.id === value.templateId)?.name || '클래식'} · {value.fontSize}px
          </span>
        </div>
        <svg
          className={`w-4 h-4 text-gray-600 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="px-4 py-4 space-y-4 border-t border-[#1a2d4d]">
          {/* Templates */}
          <div>
            <label className="block text-gray-600 text-xs mb-2">템플릿</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => update({
                    templateId: t.id,
                    fontName: t.fontName,
                    fontSize: t.fontSize,
                    primaryColor: t.primaryColor,
                    outlineColor: t.outlineColor,
                    bold: t.bold,
                  })}
                  className={`p-2 rounded-lg border text-left transition-colors ${
                    value.templateId === t.id
                      ? 'border-[#4988C4] bg-[#4988C4]/10'
                      : 'border-[#243a5c] bg-[#1a2d4d] hover:border-zinc-600'
                  }`}
                >
                  <div className="text-white text-xs font-medium">{t.name}</div>
                  <div className="text-gray-500 text-[10px] leading-tight mt-0.5">{t.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Font name */}
          <div>
            <label className="block text-gray-600 text-xs mb-1.5">글꼴</label>
            <select
              value={value.fontName}
              onChange={(e) => update({ fontName: e.target.value })}
              className="w-full px-3 py-2 bg-[#1a2d4d] border border-[#243a5c] rounded text-white text-sm focus:outline-none focus:border-[#4988C4]"
            >
              {FONTS.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>

          {/* Font size */}
          <div>
            <label className="flex justify-between items-center text-gray-600 text-xs mb-1.5">
              <span>글자 크기</span>
              <span className="text-white">{value.fontSize}px</span>
            </label>
            <input
              type="range"
              min={32} max={84} step={2}
              value={value.fontSize}
              onChange={(e) => update({ fontSize: parseInt(e.target.value) })}
              className="w-full accent-[#4988C4]"
            />
          </div>

          {/* Bold */}
          <div className="flex items-center justify-between">
            <label className="text-gray-600 text-xs">굵게</label>
            <button
              onClick={() => update({ bold: !value.bold })}
              className={`relative w-10 h-6 rounded-full transition-colors ${
                value.bold ? 'bg-[#4988C4]' : 'bg-[#243a5c]'
              }`}
            >
              <div className={`absolute top-0.5 w-5 h-5 bg-[#0a1428] rounded-full transition-transform ${
                value.bold ? 'translate-x-4' : 'translate-x-0.5'
              }`} />
            </button>
          </div>

          {/* Primary color */}
          <div>
            <label className="block text-gray-600 text-xs mb-1.5">글자 색</label>
            <div className="flex gap-2 flex-wrap">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c.hex}
                  onClick={() => update({ primaryColor: c.hex })}
                  title={c.name}
                  className={`w-8 h-8 rounded border-2 transition-all ${
                    value.primaryColor === c.hex ? 'border-[#4988C4] scale-110' : 'border-zinc-600'
                  }`}
                  style={{ backgroundColor: `#${c.hex}` }}
                />
              ))}
              <input
                type="color"
                value={`#${value.primaryColor}`}
                onChange={(e) => update({ primaryColor: e.target.value.replace('#', '').toUpperCase() })}
                className="w-8 h-8 rounded border-2 border-zinc-600 bg-transparent cursor-pointer"
                title="직접 선택"
              />
            </div>
          </div>

          {/* Outline color */}
          <div>
            <label className="block text-gray-600 text-xs mb-1.5">외곽선 색</label>
            <div className="flex gap-2 flex-wrap">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c.hex}
                  onClick={() => update({ outlineColor: c.hex })}
                  title={c.name}
                  className={`w-8 h-8 rounded border-2 transition-all ${
                    value.outlineColor === c.hex ? 'border-[#4988C4] scale-110' : 'border-zinc-600'
                  }`}
                  style={{ backgroundColor: `#${c.hex}` }}
                />
              ))}
              <input
                type="color"
                value={`#${value.outlineColor}`}
                onChange={(e) => update({ outlineColor: e.target.value.replace('#', '').toUpperCase() })}
                className="w-8 h-8 rounded border-2 border-zinc-600 bg-transparent cursor-pointer"
                title="직접 선택"
              />
            </div>
          </div>

          {/* [Phase 3] 애니메이션 + BGM + B-roll */}
          <div className="border-t border-[#1a2d4d] pt-3 space-y-3">
            <div>
              <label className="block text-gray-600 text-xs mb-1.5">자막 애니메이션</label>
              <select
                value={value.animation || 'none'}
                onChange={(e) => update({ animation: e.target.value as SubtitleStyle['animation'] })}
                className="w-full px-3 py-2 bg-[#1a2d4d] border border-[#243a5c] rounded text-white text-sm focus:outline-none focus:border-[#4988C4]"
              >
                <option value="none">없음</option>
                <option value="typewriter">타자기 (글자별)</option>
                <option value="bounce">바운스 (펄스)</option>
                <option value="wave">웨이브 (페이드+회전)</option>
              </select>
            </div>

            <div className="flex items-center justify-between">
              <label className="text-gray-600 text-xs">배경음악 (BGM)</label>
              <button
                onClick={() => update({ bgmEnabled: !value.bgmEnabled })}
                className={`relative w-10 h-6 rounded-full transition-colors ${
                  value.bgmEnabled ? 'bg-[#4988C4]' : 'bg-[#243a5c]'
                }`}
              >
                <div className={`absolute top-0.5 w-5 h-5 bg-[#0a1428] rounded-full transition-transform ${
                  value.bgmEnabled ? 'translate-x-4' : 'translate-x-0.5'
                }`} />
              </button>
            </div>
            {value.bgmEnabled && (
              <div className="pl-3 border-l-2 border-[#243a5c] space-y-2">
                <input
                  type="text"
                  value={value.bgmPath || ''}
                  onChange={(e) => update({ bgmPath: e.target.value })}
                  placeholder="mp3 절대 경로 (비워두면 mood 자동 매칭)"
                  className="w-full px-2 py-1.5 bg-[#1a2d4d] border border-[#243a5c] rounded text-white text-xs focus:outline-none focus:border-[#4988C4]"
                />
                <div>
                  <label className="flex justify-between text-gray-600 text-xs mb-1">
                    <span>볼륨</span>
                    <span className="text-white">{Math.round((value.bgmVolume ?? 0.15) * 100)}%</span>
                  </label>
                  <input
                    type="range"
                    min={0} max={50} step={1}
                    value={Math.round((value.bgmVolume ?? 0.15) * 100)}
                    onChange={(e) => update({ bgmVolume: parseInt(e.target.value) / 100 })}
                    className="w-full accent-[#4988C4]"
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <label className="text-gray-600 text-xs">B-roll 자동 삽입 (Pexels)</label>
              <button
                onClick={() => update({ brollEnabled: !value.brollEnabled })}
                className={`relative w-10 h-6 rounded-full transition-colors ${
                  value.brollEnabled ? 'bg-[#4988C4]' : 'bg-[#243a5c]'
                }`}
              >
                <div className={`absolute top-0.5 w-5 h-5 bg-[#0a1428] rounded-full transition-transform ${
                  value.brollEnabled ? 'translate-x-4' : 'translate-x-0.5'
                }`} />
              </button>
            </div>
            {value.brollEnabled && (
              <input
                type="password"
                value={value.brollApiKey || ''}
                onChange={(e) => update({ brollApiKey: e.target.value })}
                placeholder="Pexels API Key (env: PEXELS_API_KEY)"
                className="w-full px-2 py-1.5 bg-[#1a2d4d] border border-[#243a5c] rounded text-white text-xs focus:outline-none focus:border-[#4988C4]"
              />
            )}
          </div>

          {/* Phase 2 — 강조 단어 색 */}
          <div>
            <label className="block text-gray-600 text-xs mb-1.5">
              강조 색 <span className="text-gray-500">(키워드 highlight)</span>
            </label>
            <div className="flex gap-2 flex-wrap">
              {PRESET_COLORS.map((c) => (
                <button
                  key={`emph-${c.hex}`}
                  onClick={() => update({ emphasisColor: c.hex })}
                  title={c.name}
                  className={`w-8 h-8 rounded border-2 transition-all ${
                    (value.emphasisColor ?? 'FFE600') === c.hex ? 'border-[#4988C4] scale-110' : 'border-zinc-600'
                  }`}
                  style={{ backgroundColor: `#${c.hex}` }}
                />
              ))}
              <input
                type="color"
                value={`#${value.emphasisColor ?? 'FFE600'}`}
                onChange={(e) => update({ emphasisColor: e.target.value.replace('#', '').toUpperCase() })}
                className="w-8 h-8 rounded border-2 border-zinc-600 bg-transparent cursor-pointer"
                title="직접 선택"
              />
            </div>
          </div>

          {/* Phase 2 — 강조 크기 배율 */}
          <div>
            <label className="flex justify-between items-center text-gray-600 text-xs mb-1.5">
              <span>강조 크기 배율</span>
              <span className="text-white">{value.emphasisScale ?? 130}%</span>
            </label>
            <input
              type="range"
              min={100} max={180} step={5}
              value={value.emphasisScale ?? 130}
              onChange={(e) => update({ emphasisScale: parseInt(e.target.value) })}
              className="w-full accent-[#4988C4]"
            />
          </div>

          {/* Phase 2 — emoji 자동 toggle + 위치 */}
          <div className="flex items-center justify-between">
            <label className="text-gray-600 text-xs">emoji 자동 추가</label>
            <button
              onClick={() => update({ emojiEnabled: !(value.emojiEnabled ?? true) })}
              className={`relative w-10 h-6 rounded-full transition-colors ${
                (value.emojiEnabled ?? true) ? 'bg-[#4988C4]' : 'bg-[#243a5c]'
              }`}
            >
              <div className={`absolute top-0.5 w-5 h-5 bg-[#0a1428] rounded-full transition-transform ${
                (value.emojiEnabled ?? true) ? 'translate-x-4' : 'translate-x-0.5'
              }`} />
            </button>
          </div>
          {(value.emojiEnabled ?? true) && (
            <div>
              <label className="block text-gray-600 text-xs mb-1.5">emoji 위치</label>
              <div className="flex gap-2">
                {(['end', 'inline'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => update({ emojiPlacement: p })}
                    className={`flex-1 px-3 py-1.5 rounded text-xs transition-colors ${
                      (value.emojiPlacement ?? 'end') === p
                        ? 'bg-[#4988C4] text-white'
                        : 'bg-[#1a2d4d] text-gray-400 hover:text-white'
                    }`}
                  >
                    {p === 'end' ? '문장 끝' : '인라인'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Preview */}
          <div>
            <label className="block text-gray-600 text-xs mb-1.5">미리보기</label>
            <div className="relative aspect-[9/16] bg-gradient-to-br from-zinc-700 to-zinc-900 rounded overflow-hidden flex items-end justify-center pb-8 max-h-48 mx-auto">
              <div
                style={{
                  fontFamily: value.fontName,
                  fontSize: `${value.fontSize / 4}px`,
                  fontWeight: value.bold ? 700 : 400,
                  color: `#${value.primaryColor}`,
                  textShadow: `
                    -1px -1px 0 #${value.outlineColor},
                    1px -1px 0 #${value.outlineColor},
                    -1px 1px 0 #${value.outlineColor},
                    1px 1px 0 #${value.outlineColor},
                    -2px 0 0 #${value.outlineColor},
                    2px 0 0 #${value.outlineColor},
                    0 -2px 0 #${value.outlineColor},
                    0 2px 0 #${value.outlineColor}
                  `,
                }}
                className="px-3 py-1 text-center"
              >
                자막 미리보기
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
