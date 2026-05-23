/**
 * 파일 다운로드 트리거 — fetch + blob + 자동 재시도.
 *
 * v1: window.location.href → 페이지 navigate (검정 화면 버그)
 * v2: <a download href="..."> → 에러 응답도 그대로 다운로드 (download.json 버그)
 * v3 (현재): fetch + blob — 응답 사전 검증, 에러면 친화적 메시지 + 자동 재시도
 *
 * 사용자 보고: "쇼츠 다운로드 → download.json 받음 → 여러 번 누르면 결국 .mp4"
 * → 클립 생성 직후 file system이 ready 안 된 timing issue.
 *   자동 재시도(3회, 0.8s + 1.5s 간격)로 해결.
 */
export async function triggerDownload(url: string, filename?: string) {
  if (typeof document === "undefined") return;

  let lastErr: Error | null = null;
  const maxAttempts = 3;
  const retryDelays = [800, 1500];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url);

      if (!res.ok) {
        const data = await res
          .json()
          .catch(() => ({ error: `HTTP ${res.status}` }));
        lastErr = new Error(data.error || "다운로드에 실패했어요.");
        // 5xx / 404 → timing issue 가능성 → 재시도
        // 4xx (400/401/403) → 클라이언트 에러 → 즉시 throw
        if (res.status >= 500 || res.status === 404) {
          if (attempt < maxAttempts) {
            await delay(retryDelays[attempt - 1]);
            continue;
          }
        }
        throw lastErr;
      }

      // 성공 응답 (mp4 / zip 등) — blob으로 다운로드
      const blob = await res.blob();
      if (blob.size === 0) {
        lastErr = new Error("다운로드한 파일이 비어있어요.");
        if (attempt < maxAttempts) {
          await delay(retryDelays[attempt - 1]);
          continue;
        }
        throw lastErr;
      }

      const cdHeader = res.headers.get("content-disposition") || "";
      const cdFilename = extractFilenameFromContentDisposition(cdHeader);
      const finalName = filename || cdFilename || guessFilenameFromUrl(url);

      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = finalName;
      a.rel = "noopener";
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
      return;
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      if (attempt < maxAttempts) {
        await delay(retryDelays[attempt - 1]);
        continue;
      }
    }
  }

  console.error("[download] all attempts failed:", lastErr);
  alert(
    `다운로드에 실패했어요.\n\n${lastErr?.message || "알 수 없는 오류"}\n\n` +
      "잠시 후 다시 시도하거나, 좌측에서 재생성 후 다시 받아주세요.",
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function extractFilenameFromContentDisposition(cd: string): string | null {
  if (!cd) return null;
  // RFC 5987: filename*=UTF-8''<encoded> (한국어 등 비-ASCII 안전)
  const utfMatch = cd.match(/filename\*=UTF-8''([^;]+)/i);
  if (utfMatch) {
    try {
      return decodeURIComponent(utfMatch[1].replace(/["';]/g, ""));
    } catch {
      /* ignore */
    }
  }
  const m = cd.match(/filename="?([^";]+)"?/i);
  if (m) {
    try {
      return decodeURIComponent(m[1]);
    } catch {
      return m[1];
    }
  }
  return null;
}

function guessFilenameFromUrl(url: string): string {
  if (url.includes("download-zip")) return "project.zip";
  if (url.includes("/download")) return "clip.mp4";
  return "download";
}
