import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { PATHS, ensureDir } from './paths';
import { getProjectPaths } from './db';
import { emitProgress } from './progress-bus';
import { updateProject } from './db';

export async function downloadVideo(projectId: string, url: string): Promise<{ title: string; duration: number }> {
  const pp = getProjectPaths(projectId);
  ensureDir(pp.dir);

  updateProject(projectId, { status: 'downloading' });
  emitProgress({
    projectId,
    step: 'download',
    status: 'running',
    progress: 0,
    message: '영상 다운로드 시작...',
  });

  return new Promise((resolve, reject) => {
    const args = [
      // 단일 mp4 stream 우선 (FFmpeg merge 회피 — Windows에서 merge 실패 흔함)
      // bv+ba merge 패턴은 일부 코덱 조합에서 ffmpeg copy 실패함
      '-f', 'best[height<=1080][ext=mp4]/best[ext=mp4]/best[height<=1080]/best',
      '--ffmpeg-location', path.dirname(PATHS.ffmpeg),
      '-o', pp.source,
      '--write-info-json',
      '--newline',
      '--progress',
      '--no-warnings',
      // 일시적 네트워크 에러 자동 재시도 (HTTP 5xx, connection reset 등)
      '--retries', '5',
      '--fragment-retries', '5',
      '--socket-timeout', '30',
      url,
    ];

    const proc = spawn(PATHS.ytdlp, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let lastProgress = 0;

    proc.stdout.on('data', (data: Buffer) => {
      const line = data.toString();
      // yt-dlp progress: [download]  45.2% of ~500MiB ...
      const match = line.match(/(\d+\.?\d*)%/);
      if (match) {
        const pct = parseFloat(match[1]);
        if (pct > lastProgress + 1) {
          lastProgress = pct;
          emitProgress({
            projectId,
            step: 'download',
            status: 'running',
            progress: Math.min(pct, 99),
            message: `다운로드 중... ${pct.toFixed(1)}%`,
          });
        }
      }
    });

    let stderr = '';
    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        // 흔한 yt-dlp 실패 유형을 한국어로 분류 (사용자에게 친화적 메시지)
        const err = stderr.toLowerCase();
        let userMessage = '영상 다운로드에 실패했습니다.';
        if (err.includes('video unavailable') || err.includes('private video')) {
          userMessage = '이 영상은 비공개이거나 삭제되었습니다. URL을 확인해주세요.';
        } else if (err.includes('age-restricted') || err.includes('sign in')) {
          userMessage = '연령 제한 영상입니다. yt-dlp가 접근할 수 없는 영상이에요.';
        } else if (err.includes('unsupported url')) {
          userMessage = '지원하지 않는 URL 형식입니다. YouTube URL이 맞는지 확인해주세요.';
        } else if (err.includes('http error 429') || err.includes('too many requests')) {
          userMessage = 'YouTube가 일시적으로 요청을 차단했습니다. 잠시 후 다시 시도해주세요.';
        } else if (err.includes('http error 403')) {
          userMessage = 'YouTube 접근이 거부되었습니다. yt-dlp 업데이트가 필요할 수 있어요.';
        } else if (err.includes('network is unreachable') || err.includes('failed to resolve')) {
          userMessage = '네트워크 연결을 확인해주세요. 인터넷이 안 되거나 방화벽이 차단했을 수 있어요.';
        } else if (err.includes('ffmpeg')) {
          userMessage = '영상 병합 중 오류가 발생했습니다 (ffmpeg). 다시 시도해주세요.';
        }
        emitProgress({
          projectId,
          step: 'download',
          status: 'error',
          progress: 0,
          message: userMessage,
          detail: stderr.slice(-500),
        });
        // 콘솔/로그 파일에는 원본 stderr 그대로 남김 (디버깅용)
        console.error(`[yt-dlp] failed (code ${code}):`, stderr.slice(-1000));
        reject(new Error(userMessage));
        return;
      }

      // Read info json for title and duration
      let title = 'Untitled';
      let duration = 0;

      // yt-dlp writes info json alongside the output
      const infoJsonPath = pp.source.replace(/\.mp4$/, '.info.json');
      const altInfoPath = pp.source + '.info.json';
      const jsonPath = fs.existsSync(infoJsonPath) ? infoJsonPath : fs.existsSync(altInfoPath) ? altInfoPath : null;

      if (jsonPath) {
        try {
          const info = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
          title = info.title || title;
          duration = info.duration || 0;
        } catch {
          // ignore parse errors
        }
      }

      emitProgress({
        projectId,
        step: 'download',
        status: 'complete',
        progress: 100,
        message: '다운로드 완료',
      });

      updateProject(projectId, { status: 'downloaded', title, duration });
      resolve({ title, duration });
    });
  });
}
