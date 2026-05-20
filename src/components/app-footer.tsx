'use client';

import { useEffect, useState } from 'react';

/**
 * 글로벌 footer — 모든 페이지 하단에 표시.
 * - 로그 파일 열기 버튼 (에러 신고 흐름의 핵심 UX)
 * - 첫 실행 시 OS별 보안 경고 안내 모달 (SmartScreen / Gatekeeper)
 * - 문제 신고 이메일 링크
 */
const FIRST_RUN_KEY = 'ark_clipper_seen_first_run_notice_v1';

export function AppFooter() {
  const [version, setVersion] = useState<string>('');
  const [logFile, setLogFile] = useState<string | null>(null);
  const [showFirstRun, setShowFirstRun] = useState(false);
  const [platform, setPlatform] = useState<'win' | 'mac' | 'other'>('other');

  useEffect(() => {
    // 1. 버전 + 로그 파일 경로 동시 fetch
    Promise.all([
      fetch('/api/version').then((r) => (r.ok ? r.json() : { version: '' })),
      fetch('/api/system/open-log').then((r) => (r.ok ? r.json() : { logFile: null })),
    ])
      .then(([v, l]) => {
        setVersion(v.version || '');
        setLogFile(l.logFile || null);
      })
      .catch(() => {});

    // 2. OS detect
    if (typeof navigator !== 'undefined') {
      const ua = navigator.userAgent.toLowerCase();
      if (ua.includes('win')) setPlatform('win');
      else if (ua.includes('mac')) setPlatform('mac');
    }

    // 3. 첫 실행 안내 모달 표시 여부
    if (typeof localStorage !== 'undefined') {
      const seen = localStorage.getItem(FIRST_RUN_KEY);
      if (!seen) setShowFirstRun(true);
    }
  }, []);

  function dismissFirstRun() {
    try {
      localStorage.setItem(FIRST_RUN_KEY, new Date().toISOString());
    } catch {
      /* ignore */
    }
    setShowFirstRun(false);
  }

  async function openLogFile() {
    try {
      const res = await fetch('/api/system/open-log', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || '로그 파일을 열 수 없습니다.');
      }
    } catch (e) {
      alert(`로그 파일 열기 실패: ${e instanceof Error ? e.message : e}`);
    }
  }

  return (
    <>
      <footer className="border-t border-[#1a2d4d] px-6 py-3 text-xs text-gray-500 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <span>Ark Clipper{version ? ` v${version}` : ''}</span>
          {logFile && (
            <span className="hidden md:inline text-gray-700 font-mono text-[10px]" title={logFile}>
              {logFile.length > 60 ? '…' + logFile.slice(-60) : logFile}
            </span>
          )}
        </div>
        <div className="flex gap-4 items-center">
          <button
            onClick={openLogFile}
            className="hover:text-[#4988C4] transition-colors"
            title="에러 발생 시 첨부할 로그 파일을 텍스트 에디터로 엽니다"
          >
            📋 로그 파일 열기
          </button>
          <a
            href="mailto:joshua@arkstudio.kr?subject=Ark%20Clipper%20문의"
            className="hover:text-[#4988C4] transition-colors"
          >
            📧 문제 신고
          </a>
        </div>
      </footer>

      {showFirstRun && platform !== 'other' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={dismissFirstRun}
        >
          <div
            className="max-w-md w-full mx-4 bg-[#0a1428] border border-[#243a5c] rounded-xl p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold mb-3 text-white">👋 Ark Clipper에 오신 것을 환영합니다</h2>
            {platform === 'win' && (
              <div className="space-y-3 text-sm text-gray-300">
                <p className="text-[#4988C4] font-semibold">⚠️ Windows SmartScreen 경고가 떴다면</p>
                <p>이 앱은 코드 서명 인증서가 없어 Windows가 처음 보는 앱이라고 경고합니다. 안전합니다.</p>
                <ol className="space-y-1 list-decimal list-inside text-gray-400">
                  <li>&quot;자세한 정보&quot; 클릭</li>
                  <li>&quot;실행&quot; 버튼 클릭</li>
                </ol>
                <p className="text-xs text-gray-600 pt-2">
                  (모든 영상 처리는 본인 PC에서 실행됩니다. 외부 서버로 영상이 전송되지 않아요.)
                </p>
              </div>
            )}
            {platform === 'mac' && (
              <div className="space-y-3 text-sm text-gray-300">
                <p className="text-[#4988C4] font-semibold">⚠️ &quot;확인되지 않은 개발자&quot; 경고가 떴다면</p>
                <p>이 앱은 Apple 공증을 받지 않아 Gatekeeper가 처음 차단합니다. 안전합니다.</p>
                <ol className="space-y-1 list-decimal list-inside text-gray-400">
                  <li>Applications 폴더에서 Ark Clipper를 <b>우클릭</b> → <b>&quot;열기&quot;</b></li>
                  <li>경고창에서 <b>&quot;열기&quot;</b> 클릭 (한 번만)</li>
                  <li>이후로는 일반 실행 가능</li>
                </ol>
                <p className="text-xs text-gray-600 pt-2">
                  (모든 영상 처리는 본인 Mac에서 실행됩니다. 외부 서버로 영상이 전송되지 않아요.)
                </p>
              </div>
            )}
            <button
              onClick={dismissFirstRun}
              className="mt-5 w-full py-2 bg-[#1C4D8D] hover:bg-[#0F2854] text-white rounded font-medium text-sm transition-colors"
            >
              확인했어요
            </button>
          </div>
        </div>
      )}
    </>
  );
}
