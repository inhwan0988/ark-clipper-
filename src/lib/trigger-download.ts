/**
 * 파일 다운로드를 안전하게 트리거.
 *
 * 이전: window.location.href = '/api/...' → Electron Chromium이
 *      attachment response를 처리하면서 페이지 자체 navigate가
 *      발생해 검정 화면 + DevTools source view가 뜨는 버그.
 *
 * 표준 방식: 보이지 않는 <a download href="..."> 생성 + click + 제거.
 * download attribute가 브라우저/Electron에 "다운로드 트리거"를 명시.
 * 페이지 navigation 없음.
 */
export function triggerDownload(url: string, filename?: string) {
  if (typeof document === 'undefined') return;
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || ''; // 빈 문자열도 hint 역할
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
