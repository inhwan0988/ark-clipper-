'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'ark_clipper_storage_path';

export function getStoredStoragePath(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(STORAGE_KEY) || '';
}

export function setStoredStoragePath(path: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, path);
}

export function ApiStoragePathSettings() {
  const [savedPath, setSavedPath] = useState('');
  const [picking, setPicking] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [showManual, setShowManual] = useState(false);

  useEffect(() => {
    setSavedPath(getStoredStoragePath());
  }, []);

  async function pickFolder() {
    if (picking) return;
    setPicking(true);
    try {
      const res = await fetch('/api/system/pick-folder', { method: 'POST' });
      const data = await res.json();
      if (data.path) {
        setStoredStoragePath(data.path);
        setSavedPath(data.path);
      } else if (data.error) {
        // 폴더 선택 dialog 실패 (Windows PowerShell 권한/모드 문제 등) → 텍스트 입력 모드
        setShowManual(true);
        alert(
          `폴더 선택 창을 열 수 없습니다.\n경로를 직접 입력해주세요.\n\n오류: ${data.error}`,
        );
      }
    } catch (err) {
      // 네트워크 또는 미지원 → 텍스트 입력 fallback
      setShowManual(true);
      alert(
        `폴더 선택 창을 열 수 없습니다. 경로를 직접 입력해주세요.\n\n예시:\n  Windows: D:\\ARK_Shorts\n  Mac: /Users/이름/Movies/Shorts\n\n${
          err instanceof Error ? err.message : ''
        }`,
      );
    } finally {
      setPicking(false);
    }
  }

  function saveManualPath() {
    const trimmed = manualInput.trim();
    if (!trimmed) {
      alert('경로를 입력해주세요.');
      return;
    }
    // 절대 경로 검증 (간단 — 서버에서 추가 검증)
    const isWin = /^[A-Za-z]:[\\/]/.test(trimmed);
    const isPosix = trimmed.startsWith('/');
    if (!isWin && !isPosix) {
      alert(
        '절대 경로를 입력해주세요.\nWindows 예: D:\\ARK_Shorts\nMac 예: /Users/이름/Movies/Shorts',
      );
      return;
    }
    setStoredStoragePath(trimmed);
    setSavedPath(trimmed);
    setManualInput('');
    setShowManual(false);
  }

  function clear() {
    if (!confirm('기본 저장 폴더(앱 데이터 폴더 안)로 되돌릴까요?')) return;
    setStoredStoragePath('');
    setSavedPath('');
  }

  return (
    <div className="w-full max-w-2xl rounded-lg border border-[#1a2d4d] bg-[#0a1428]">
      <div className="px-4 py-3">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <svg className="w-4 h-4 text-[#4988C4] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            <h3 className="text-sm font-semibold text-white whitespace-nowrap">저장 폴더 (선택)</h3>
            {savedPath ? (
              <span className="text-[11px] px-2 py-0.5 bg-[#4988C4]/20 text-[#4988C4] rounded font-mono truncate" title={savedPath}>
                {savedPath}
              </span>
            ) : (
              <span className="text-[10px] px-1.5 py-0.5 bg-[#1a2d4d] text-gray-500 rounded whitespace-nowrap">기본 폴더 사용</span>
            )}
          </div>
          <div className="flex gap-1 flex-shrink-0">
            <button
              onClick={pickFolder}
              disabled={picking}
              className="px-2.5 py-1 bg-[#1C4D8D] text-white rounded text-xs font-medium hover:bg-[#0F2854] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
            >
              {picking ? (
                <>
                  <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  선택 중...
                </>
              ) : (
                <>📁 {savedPath ? '폴더 변경' : '폴더 선택'}</>
              )}
            </button>
            {savedPath && (
              <button
                onClick={clear}
                className="px-2.5 py-1 bg-[#11203d] border border-[#243a5c] text-gray-600 rounded text-xs hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30"
              >
                초기화
              </button>
            )}
          </div>
        </div>

        <p className="text-gray-500 text-[11px]">
          새 프로젝트가 저장될 폴더입니다. {!savedPath && '비워두면 기본 위치(앱 데이터 폴더 안) 사용. '}
          기존 프로젝트는 영향 없음.
          {picking && <span className="text-[#4988C4]"> ← Windows 폴더 선택 창이 떴는지 확인하세요 (작업 표시줄 또는 다른 창 뒤)</span>}
        </p>

        {/* 텍스트 직접 입력 (폴더 선택 dialog 안 될 때 fallback) */}
        {showManual ? (
          <div className="mt-3 flex gap-2 items-center">
            <input
              type="text"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveManualPath();
              }}
              placeholder="Windows: D:\ARK_Shorts  /  Mac: /Users/이름/Movies/Shorts"
              className="flex-1 px-3 py-1.5 bg-[#0a1428] border border-[#243a5c] rounded text-white text-xs font-mono focus:outline-none focus:border-[#4988C4]"
              autoFocus
            />
            <button
              onClick={saveManualPath}
              className="px-3 py-1.5 bg-[#1C4D8D] text-white rounded text-xs hover:bg-[#0F2854]"
            >
              저장
            </button>
            <button
              onClick={() => {
                setShowManual(false);
                setManualInput('');
              }}
              className="px-2 py-1.5 text-gray-500 text-xs hover:text-white"
            >
              취소
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowManual(true)}
            className="mt-2 text-[10px] text-gray-600 hover:text-[#4988C4] underline"
          >
            폴더 경로 직접 입력하기
          </button>
        )}
      </div>
    </div>
  );
}
