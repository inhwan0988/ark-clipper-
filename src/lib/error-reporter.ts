/**
 * Opt-in 익명 에러 보고 — ark-clipper는 100% 로컬 앱이라
 * 사용자가 명시적으로 동의한 경우에만 외부(arkvvs-tools)로 보냄.
 *
 * localStorage 'ark-clipper-error-reporting' === 'true' 일 때만 fetch.
 * fire-and-forget — 실패해도 앱 흐름 영향 X.
 */

const ENDPOINT = 'https://tools.arkvvs.ai/api/log-error';
const OPT_IN_KEY = 'ark-clipper-error-reporting';

export function isErrorReportingEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(OPT_IN_KEY) === 'true';
}

export function setErrorReportingEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(OPT_IN_KEY, enabled ? 'true' : 'false');
}

export interface ReportErrorOpts {
  message: string;
  stack?: string;
  route?: string;
  context?: Record<string, unknown>;
}

export function reportError(opts: ReportErrorOpts): void {
  if (!isErrorReportingEnabled()) return;
  if (!opts.message) return;

  const payload = {
    message: opts.message,
    stack: opts.stack,
    toolSlug: 'ark-clipper',
    route: opts.route ?? (typeof window !== 'undefined' ? window.location.pathname : undefined),
    context: opts.context,
    source: 'helper',
  };

  // fire-and-forget
  try {
    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => { /* ignore */ });
  } catch {
    /* ignore */
  }
}
