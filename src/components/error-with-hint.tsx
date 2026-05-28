'use client';

import { useEffect } from 'react';
import { hintForError } from '@/lib/error-hints';
import { reportError, isErrorReportingEnabled } from '@/lib/error-reporter';

interface Props {
  /** 사용자가 본 raw 에러 메시지 */
  message: string;
  /** 현재 페이지 라우트 (자동 보고용) */
  route?: string;
  /** stack trace (선택) */
  stack?: string;
  /** 부가 컨텍스트 */
  context?: Record<string, unknown>;
  /** 자동 보고 비활성 (이미 다른 곳에서 보고했을 때) */
  skipReport?: boolean;
  /** 닫기 콜백 */
  onDismiss?: () => void;
}

/**
 * 에러 메시지를 받아:
 *  1) 흔한 에러는 lib/error-hints.ts 매핑대로 친절 안내 표시
 *  2) opt-in 동의된 경우만 tools.arkvvs.ai/api/log-error 로 익명 보고
 *
 * ark-clipper는 100% 로컬 앱이라 opt-in 체크를 reporter 안에서 강제.
 */
export default function ErrorWithHint({
  message,
  route,
  stack,
  context,
  skipReport = false,
  onDismiss,
}: Props) {
  useEffect(() => {
    if (skipReport || !message) return;
    // reporter 내부에서 opt-in 확인 후만 fetch
    if (!isErrorReportingEnabled()) return;
    reportError({ message, stack, route, context });
  }, [message, stack, route, context, skipReport]);

  const h = hintForError(message);

  return (
    <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-red-400 flex items-center gap-1.5">
            <span>⚠️</span>
            {h.title}
          </p>
          <p className="text-[13px] text-gray-300 mt-1.5 leading-relaxed">
            {h.hint}
          </p>
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="text-gray-500 hover:text-gray-300 text-lg leading-none px-1"
            aria-label="닫기"
          >
            ×
          </button>
        )}
      </div>

      {h.actions && h.actions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {h.actions.map((a) => (
            <a
              key={a.href}
              href={a.href}
              target={a.href.startsWith('http') ? '_blank' : undefined}
              rel="noopener noreferrer"
              className="px-2.5 py-1 rounded bg-[#11203d] border border-[#243a5c] text-xs font-semibold text-gray-200 hover:bg-[#1a2d4d]"
            >
              {a.label} →
            </a>
          ))}
        </div>
      )}

      <details className="pt-1">
        <summary className="text-[11px] text-gray-500 cursor-pointer hover:text-gray-300">
          기술 정보 (원본 메시지)
        </summary>
        <pre className="mt-1 p-2 bg-[#0a1428] border border-[#1a2d4d] rounded text-[11px] font-mono text-gray-500 overflow-x-auto whitespace-pre-wrap break-all">
          {message}
        </pre>
      </details>
    </div>
  );
}
