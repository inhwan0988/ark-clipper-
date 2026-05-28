'use client';

import { useEffect, useState } from 'react';
import { isErrorReportingEnabled, setErrorReportingEnabled } from '@/lib/error-reporter';

/**
 * 익명 에러 보고 opt-in 토글.
 *
 * ark-clipper는 100% 로컬 앱이라 명시 동의 없이 외부로 아무것도 안 보냄.
 * 사용자가 체크해야만 에러 발생 시 익명 정보가 tools.arkvvs.ai 로 전송됨.
 * 기본 OFF (안전).
 */
export function ErrorReportingSettings() {
  const [enabled, setEnabled] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setEnabled(isErrorReportingEnabled());
    setMounted(true);
  }, []);

  function toggle() {
    const next = !enabled;
    setErrorReportingEnabled(next);
    setEnabled(next);
  }

  // SSR mismatch 방지 — mount 전에는 OFF로 표시
  const display = mounted ? enabled : false;

  return (
    <div className="w-full max-w-2xl rounded-lg border border-[#1a2d4d] bg-[#0a1428]">
      <div className="px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <svg
                className={`w-4 h-4 ${display ? 'text-green-400' : 'text-gray-500'}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                />
              </svg>
              <h3 className="text-sm font-semibold text-white">익명 에러 보고</h3>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded ${
                  display
                    ? 'bg-green-500/20 text-green-400'
                    : 'bg-[#11203d] text-gray-500'
                }`}
              >
                {display ? '켜짐' : '꺼짐'}
              </span>
            </div>
            <p className="text-gray-600 text-xs leading-relaxed">
              에러 발생 시 익명 정보(에러 메시지, 라우트)를 개발자에게 보내 앱 개선에 도움을 줍니다.
              API 키나 영상 내용은 절대 전송되지 않습니다. 기본 꺼짐 — 동의 시에만 작동.
            </p>
          </div>
          <button
            type="button"
            onClick={toggle}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full border transition-colors ${
              display
                ? 'bg-[#1C4D8D] border-[#4988C4]'
                : 'bg-[#11203d] border-[#243a5c]'
            }`}
            role="switch"
            aria-checked={display}
            aria-label="익명 에러 보고 활성화"
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                display ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
