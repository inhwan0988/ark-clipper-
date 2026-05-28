'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'ark_clipper_anthropic_api_key';
const OPENAI_STORAGE_KEY = 'ark_clipper_openai_api_key';
// Phase 4 — AssemblyAI 키 + diarization on/off
const ASSEMBLY_STORAGE_KEY = 'ark_clipper_assemblyai_api_key';
const DIARIZATION_ENABLED_KEY = 'ark_clipper_diarization_enabled';

/**
 * 사용자의 Anthropic API 키를 localStorage에 저장하는 헬퍼.
 * 서버에는 저장되지 않으며, 각 사용자의 브라우저에만 보관됨.
 */
export function getStoredApiKey(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(STORAGE_KEY) || '';
}

export function setStoredApiKey(key: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, key);
}

/**
 * 사용자의 OpenAI API 키 (Whisper 음성 인식용).
 */
export function getStoredOpenAiKey(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(OPENAI_STORAGE_KEY) || '';
}

export function setStoredOpenAiKey(key: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(OPENAI_STORAGE_KEY, key);
}

/**
 * Phase 4 — 사용자의 AssemblyAI API 키 (Speaker Diarization 옵션).
 */
export function getStoredAssemblyKey(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(ASSEMBLY_STORAGE_KEY) || '';
}

export function setStoredAssemblyKey(key: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ASSEMBLY_STORAGE_KEY, key);
}

export function getDiarizationEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(DIARIZATION_ENABLED_KEY) === 'true';
}

export function setDiarizationEnabled(on: boolean) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(DIARIZATION_ENABLED_KEY, on ? 'true' : 'false');
}

export function maskKey(key: string): string {
  if (!key) return '';
  if (key.length <= 12) return '••••';
  return `${key.slice(0, 12)}${'•'.repeat(20)}${key.slice(-4)}`;
}

interface Props {
  onChange?: (key: string) => void;
}

export function ApiKeySettings({ onChange }: Props) {
  const [savedKey, setSavedKey] = useState('');
  const [draftKey, setDraftKey] = useState('');
  const [editing, setEditing] = useState(false);
  const [showFull, setShowFull] = useState(false);

  useEffect(() => {
    const k = getStoredApiKey();
    setSavedKey(k);
    setDraftKey(k);
    if (!k) setEditing(true); // 키가 없으면 자동으로 편집 모드
  }, []);

  function save() {
    const trimmed = draftKey.trim();
    setStoredApiKey(trimmed);
    setSavedKey(trimmed);
    setEditing(false);
    setShowFull(false);
    onChange?.(trimmed);
  }

  function clear() {
    if (!confirm('저장된 API 키를 삭제할까요?')) return;
    setStoredApiKey('');
    setSavedKey('');
    setDraftKey('');
    setEditing(true);
    onChange?.('');
  }

  const isValid = draftKey.trim().startsWith('sk-ant-');

  return (
    <div className={`w-full max-w-2xl rounded-lg border ${
      savedKey
        ? 'border-[#1a2d4d] bg-[#0a1428]'
        : 'border-orange-500/40 bg-orange-500/5'
    }`}>
      <div className="px-4 py-3">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-2">
            <svg className={`w-4 h-4 ${savedKey ? 'text-green-400' : 'text-orange-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
            <h3 className="text-sm font-semibold text-white">
              Anthropic API 키
            </h3>
            {savedKey && !editing && (
              <span className="text-[10px] px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded">설정됨</span>
            )}
            {!savedKey && (
              <span className="text-[10px] px-1.5 py-0.5 bg-orange-500/20 text-orange-400 rounded">필요</span>
            )}
          </div>
          {savedKey && !editing && (
            <div className="flex gap-1">
              <button
                onClick={() => setEditing(true)}
                className="px-2.5 py-1 bg-[#11203d] border border-[#243a5c] text-gray-300 rounded text-xs hover:bg-[#1a2d4d]"
              >
                수정
              </button>
              <button
                onClick={clear}
                className="px-2.5 py-1 bg-[#11203d] border border-[#243a5c] text-gray-600 rounded text-xs hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30"
              >
                삭제
              </button>
            </div>
          )}
        </div>

        {!editing && savedKey && (
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-gray-600">
              {showFull ? savedKey : maskKey(savedKey)}
            </span>
            <button
              onClick={() => setShowFull(!showFull)}
              className="text-gray-500 hover:text-gray-300 text-xs"
            >
              {showFull ? '숨기기' : '보이기'}
            </button>
          </div>
        )}

        {editing && (
          <div className="space-y-2">
            <p className="text-gray-600 text-xs">
              Claude AI 분석을 위해 본인의 API 키가 필요합니다. 키는 이 브라우저에만 저장되며, 서버나 다른 사용자에게 공유되지 않습니다.
            </p>
            <div className="flex gap-2">
              <input
                type={showFull ? 'text' : 'password'}
                value={draftKey}
                onChange={(e) => setDraftKey(e.target.value)}
                placeholder="sk-ant-api03-..."
                className="flex-1 px-3 py-2 bg-[#0a1428] border border-[#243a5c] rounded text-white text-sm font-mono focus:outline-none focus:border-[#4988C4]"
                autoComplete="off"
                spellCheck={false}
              />
              <button
                onClick={() => setShowFull(!showFull)}
                className="px-2.5 py-2 bg-[#11203d] border border-[#243a5c] text-gray-600 rounded text-xs hover:bg-[#1a2d4d]"
                title={showFull ? '가리기' : '보기'}
              >
                {showFull ? '🙈' : '👁️'}
              </button>
            </div>
            {draftKey && !isValid && (
              <p className="text-orange-400 text-[11px]">
                ⚠️ Anthropic API 키는 보통 <code className="bg-[#0a1428] px-1 rounded">sk-ant-</code>로 시작합니다.
              </p>
            )}
            <div className="flex justify-between items-center gap-2">
              <a
                href="https://console.anthropic.com/settings/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#4988C4] hover:text-[#4988C4] text-xs"
              >
                🔗 Anthropic 콘솔에서 API 키 발급받기
              </a>
              <div className="flex gap-2">
                {savedKey && (
                  <button
                    onClick={() => { setDraftKey(savedKey); setEditing(false); setShowFull(false); }}
                    className="px-3 py-1.5 bg-[#11203d] border border-[#243a5c] text-gray-600 rounded text-xs hover:bg-[#1a2d4d]"
                  >
                    취소
                  </button>
                )}
                <button
                  onClick={save}
                  disabled={!draftKey.trim()}
                  className="px-3 py-1.5 bg-[#1C4D8D] text-white rounded text-xs font-medium hover:bg-[#0F2854] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  💾 저장
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * OpenAI API 키 입력 (Whisper 음성 인식용).
 */
export function OpenAiKeySettings({ onChange }: Props) {
  const [savedKey, setSavedKey] = useState('');
  const [draftKey, setDraftKey] = useState('');
  const [editing, setEditing] = useState(false);
  const [showFull, setShowFull] = useState(false);

  useEffect(() => {
    const k = getStoredOpenAiKey();
    setSavedKey(k);
    setDraftKey(k);
    if (!k) setEditing(true);
  }, []);

  function save() {
    const trimmed = draftKey.trim();
    setStoredOpenAiKey(trimmed);
    setSavedKey(trimmed);
    setEditing(false);
    setShowFull(false);
    onChange?.(trimmed);
  }

  function clear() {
    if (!confirm('저장된 OpenAI API 키를 삭제할까요?')) return;
    setStoredOpenAiKey('');
    setSavedKey('');
    setDraftKey('');
    setEditing(true);
    onChange?.('');
  }

  const isValid = draftKey.trim().startsWith('sk-');

  return (
    <div
      className={`w-full max-w-2xl rounded-lg border ${
        savedKey ? 'border-[#1a2d4d] bg-[#0a1428]' : 'border-orange-500/40 bg-orange-500/5'
      }`}
    >
      <div className="px-4 py-3">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-2">
            <svg
              className={`w-4 h-4 ${savedKey ? 'text-green-400' : 'text-orange-400'}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
              />
            </svg>
            <h3 className="text-sm font-semibold text-white">OpenAI API 키</h3>
            <span className="text-[10px] text-gray-500">(음성 인식)</span>
            {savedKey && !editing && (
              <span className="text-[10px] px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded">설정됨</span>
            )}
            {!savedKey && (
              <span className="text-[10px] px-1.5 py-0.5 bg-orange-500/20 text-orange-400 rounded">필요</span>
            )}
          </div>
          {savedKey && !editing && (
            <div className="flex gap-1">
              <button
                onClick={() => setEditing(true)}
                className="px-2.5 py-1 bg-[#11203d] border border-[#243a5c] text-gray-300 rounded text-xs hover:bg-[#1a2d4d]"
              >
                수정
              </button>
              <button
                onClick={clear}
                className="px-2.5 py-1 bg-[#11203d] border border-[#243a5c] text-gray-600 rounded text-xs hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30"
              >
                삭제
              </button>
            </div>
          )}
        </div>

        {!editing && savedKey && (
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-gray-600">
              {showFull ? savedKey : maskKey(savedKey)}
            </span>
            <button
              onClick={() => setShowFull(!showFull)}
              className="text-gray-500 hover:text-gray-300 text-xs"
            >
              {showFull ? '숨기기' : '보이기'}
            </button>
          </div>
        )}

        {editing && (
          <div className="space-y-2">
            <p className="text-gray-600 text-xs">
              한국어 음성 인식(Whisper API)에 사용됩니다. 영상 1분당 약 $0.006 소모.
              키는 이 브라우저에만 저장되며, 서버나 다른 사용자에게 공유되지 않습니다.
            </p>
            <div className="flex gap-2">
              <input
                type={showFull ? 'text' : 'password'}
                value={draftKey}
                onChange={(e) => setDraftKey(e.target.value)}
                placeholder="sk-..."
                className="flex-1 px-3 py-2 bg-[#0a1428] border border-[#243a5c] rounded text-white text-sm font-mono focus:outline-none focus:border-[#4988C4]"
                autoComplete="off"
                spellCheck={false}
              />
              <button
                onClick={() => setShowFull(!showFull)}
                className="px-2.5 py-2 bg-[#11203d] border border-[#243a5c] text-gray-600 rounded text-xs hover:bg-[#1a2d4d]"
                title={showFull ? '가리기' : '보기'}
              >
                {showFull ? '🙈' : '👁️'}
              </button>
            </div>
            {draftKey && !isValid && (
              <p className="text-orange-400 text-[11px]">
                ⚠️ OpenAI API 키는 보통 <code className="bg-[#0a1428] px-1 rounded">sk-</code>로 시작합니다.
              </p>
            )}
            <div className="flex justify-between items-center gap-2">
              <a
                href="https://platform.openai.com/api-keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#4988C4] hover:text-[#4988C4] text-xs"
              >
                🔗 OpenAI 플랫폼에서 API 키 발급받기
              </a>
              <div className="flex gap-2">
                {savedKey && (
                  <button
                    onClick={() => {
                      setDraftKey(savedKey);
                      setEditing(false);
                      setShowFull(false);
                    }}
                    className="px-3 py-1.5 bg-[#11203d] border border-[#243a5c] text-gray-600 rounded text-xs hover:bg-[#1a2d4d]"
                  >
                    취소
                  </button>
                )}
                <button
                  onClick={save}
                  disabled={!draftKey.trim()}
                  className="px-3 py-1.5 bg-[#1C4D8D] text-white rounded text-xs font-medium hover:bg-[#0F2854] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  💾 저장
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Phase 4 — AssemblyAI API 키 + 화자 구분 토글.
 * 옵션 기능이라 미설정해도 앱 동작에는 영향 없음.
 */
export function AssemblyAiKeySettings({ onChange }: Props) {
  const [savedKey, setSavedKey] = useState('');
  const [draftKey, setDraftKey] = useState('');
  const [editing, setEditing] = useState(false);
  const [showFull, setShowFull] = useState(false);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const k = getStoredAssemblyKey();
    setSavedKey(k);
    setDraftKey(k);
    setEnabled(getDiarizationEnabled());
  }, []);

  function save() {
    const trimmed = draftKey.trim();
    setStoredAssemblyKey(trimmed);
    setSavedKey(trimmed);
    setEditing(false);
    setShowFull(false);
    onChange?.(trimmed);
  }

  function clear() {
    if (!confirm('저장된 AssemblyAI 키를 삭제할까요? 화자 구분도 자동 비활성됩니다.')) return;
    setStoredAssemblyKey('');
    setSavedKey('');
    setDraftKey('');
    setEditing(true);
    setEnabled(false);
    setDiarizationEnabled(false);
    onChange?.('');
  }

  function toggleEnabled() {
    const next = !enabled;
    if (next && !savedKey) {
      alert('먼저 AssemblyAI API 키를 저장해주세요.');
      return;
    }
    setEnabled(next);
    setDiarizationEnabled(next);
  }

  return (
    <div className="w-full max-w-2xl rounded-lg border border-[#1a2d4d] bg-[#0a1428]">
      <div className="px-4 py-3">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-2">
            <span className="text-sm">🗣️</span>
            <h3 className="text-sm font-semibold text-white">화자 구분 (AssemblyAI)</h3>
            <span className="text-[10px] text-gray-500">(옵션)</span>
            {savedKey && enabled && (
              <span className="text-[10px] px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded">활성</span>
            )}
            {savedKey && !enabled && (
              <span className="text-[10px] px-1.5 py-0.5 bg-[#11203d] text-gray-500 rounded">비활성</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {savedKey && (
              <label className="flex items-center gap-1.5 text-[11px] text-gray-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={toggleEnabled}
                  className="accent-[#4988C4]"
                />
                자동 화자 구분
              </label>
            )}
            {savedKey && !editing && (
              <div className="flex gap-1">
                <button
                  onClick={() => setEditing(true)}
                  className="px-2.5 py-1 bg-[#11203d] border border-[#243a5c] text-gray-300 rounded text-xs hover:bg-[#1a2d4d]"
                >
                  수정
                </button>
                <button
                  onClick={clear}
                  className="px-2.5 py-1 bg-[#11203d] border border-[#243a5c] text-gray-600 rounded text-xs hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30"
                >
                  삭제
                </button>
              </div>
            )}
          </div>
        </div>

        {!editing && savedKey && (
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-gray-600">
              {showFull ? savedKey : maskKey(savedKey)}
            </span>
            <button
              onClick={() => setShowFull(!showFull)}
              className="text-gray-500 hover:text-gray-300 text-xs"
            >
              {showFull ? '숨기기' : '보이기'}
            </button>
          </div>
        )}

        {!editing && !savedKey && (
          <div className="space-y-2">
            <p className="text-gray-500 text-xs">
              여러 사람이 등장하는 영상에서 자동 화자 구분 (&quot;화자A: ...&quot;, &quot;화자B: ...&quot;) 자막을 만들고 싶다면 AssemblyAI 키를 입력하세요. 미설정 시 일반 Whisper 자막만 사용됩니다.
            </p>
            <button
              onClick={() => setEditing(true)}
              className="px-3 py-1.5 bg-[#1C4D8D] text-white rounded text-xs font-medium hover:bg-[#0F2854]"
            >
              + AssemblyAI 키 추가
            </button>
          </div>
        )}

        {editing && (
          <div className="space-y-2">
            <p className="text-gray-600 text-xs">
              AssemblyAI 키는 이 브라우저에만 저장됩니다. 무료 티어 월 5시간까지 사용 가능.
            </p>
            <div className="flex gap-2">
              <input
                type={showFull ? 'text' : 'password'}
                value={draftKey}
                onChange={(e) => setDraftKey(e.target.value)}
                placeholder="AssemblyAI API 키 (16진수 문자열)"
                className="flex-1 px-3 py-2 bg-[#0a1428] border border-[#243a5c] rounded text-white text-sm font-mono focus:outline-none focus:border-[#4988C4]"
                autoComplete="off"
                spellCheck={false}
              />
              <button
                onClick={() => setShowFull(!showFull)}
                className="px-2.5 py-2 bg-[#11203d] border border-[#243a5c] text-gray-600 rounded text-xs hover:bg-[#1a2d4d]"
                title={showFull ? '가리기' : '보기'}
              >
                {showFull ? '🙈' : '👁️'}
              </button>
            </div>
            <div className="flex justify-between items-center gap-2">
              <a
                href="https://www.assemblyai.com/dashboard/signup"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#4988C4] hover:text-[#4988C4] text-xs"
              >
                🔗 AssemblyAI 가입하고 키 발급
              </a>
              <div className="flex gap-2">
                {savedKey && (
                  <button
                    onClick={() => { setDraftKey(savedKey); setEditing(false); setShowFull(false); }}
                    className="px-3 py-1.5 bg-[#11203d] border border-[#243a5c] text-gray-600 rounded text-xs hover:bg-[#1a2d4d]"
                  >
                    취소
                  </button>
                )}
                <button
                  onClick={save}
                  disabled={!draftKey.trim()}
                  className="px-3 py-1.5 bg-[#1C4D8D] text-white rounded text-xs font-medium hover:bg-[#0F2854] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  💾 저장
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
