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
        emitProgress({
          projectId,
          step: 'download',
          status: 'error',
          progress: 0,
          message: '다운로드 실패',
          detail: stderr.slice(0, 500),
        });
        reject(new Error(`yt-dlp exited with code ${code}: ${stderr.slice(0, 500)}`));
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
