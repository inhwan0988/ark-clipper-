/**
 * [Phase 3 / Task 2] B-roll Compose — ffmpeg overlay.
 *
 * 입력 클립 mp4 + b-roll mp4 리스트 → b-roll을 일정 구간 overlay한 새 mp4.
 *
 * 회피: ffmpeg-ops.ts 만지지 않고 별도 모듈로 (Phase 1 conflict 방지).
 * 사용 시점: 클립 생성 후 post-process 단계에서 호출.
 */
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { PATHS } from './paths';

export interface BrollOverlay {
  /** b-roll 파일 절대경로 (downloadPexelsVideo의 결과) */
  brollPath: string;
  /** 클립 내부에서 overlay 시작 시각 (초) */
  startSec: number;
  /** overlay 지속 시간 (초). 보통 3~5초 */
  durationSec: number;
}

export interface ComposeBrollOptions {
  /** 원본 클립 mp4 절대경로 */
  inputClipPath: string;
  /** 출력 mp4 절대경로 */
  outputPath: string;
  /** overlay 들 (시간 겹침 없도록 호출자가 보장) */
  overlays: BrollOverlay[];
  /** overlay 의 화면 위치/크기 — 미지정 시 우상단 30% PIP */
  pip?: {
    x?: number;        // 1080 기준 left
    y?: number;        // 1920 기준 top
    width?: number;    // 1080 기준 width
  };
}

/**
 * b-roll들을 PIP overlay로 합성. overlays가 비어있으면 input을 그대로 copy.
 *
 * 구현: 각 b-roll을 enable=between(t,start,end) 조건으로 동시에 입력에 overlay.
 * 모든 b-roll은 비디오 트랙만 사용(오디오 무시).
 *
 * Limitation: overlay가 6개 이상이면 ffmpeg filtergraph 길이 증가 → 일반적인
 * 30~90초 클립에서는 보통 1~3개 권장.
 */
export async function composeBroll(opts: ComposeBrollOptions): Promise<string> {
  if (opts.overlays.length === 0) {
    // overlay 없으면 copy
    fs.copyFileSync(opts.inputClipPath, opts.outputPath);
    return opts.outputPath;
  }

  // 모든 b-roll 파일 존재 확인 + 시간 정렬
  const valid = opts.overlays
    .filter((o) => o.brollPath && fs.existsSync(o.brollPath) && o.durationSec > 0)
    .slice(0, 6)
    .sort((a, b) => a.startSec - b.startSec);

  if (valid.length === 0) {
    fs.copyFileSync(opts.inputClipPath, opts.outputPath);
    return opts.outputPath;
  }

  const pipX = opts.pip?.x ?? 700;       // 우상단
  const pipY = opts.pip?.y ?? 80;
  const pipW = opts.pip?.width ?? 320;   // 320px width (1080 기준 약 30%)

  // ffmpeg args 구성
  const args: string[] = ['-i', opts.inputClipPath];
  for (const o of valid) {
    args.push('-i', o.brollPath);
  }

  // filter_complex: 각 b-roll을 scale 후 overlay enable timing 적용
  // chain: [0:v] → [bg]; [1:v] scale → [b0]; [bg][b0] overlay enable=... → [v1]; ...
  const parts: string[] = [];
  parts.push(`[0:v]null[bg0]`);
  for (let i = 0; i < valid.length; i++) {
    const o = valid[i];
    const inputIdx = i + 1;
    parts.push(`[${inputIdx}:v]scale=${pipW}:-2,setsar=1[b${i}]`);
    const endSec = o.startSec + o.durationSec;
    parts.push(
      `[bg${i}][b${i}]overlay=${pipX}:${pipY}:enable='between(t,${o.startSec.toFixed(2)},${endSec.toFixed(2)})'[bg${i + 1}]`,
    );
  }
  const finalLabel = `[bg${valid.length}]`;

  args.push(
    '-filter_complex', parts.join(';'),
    '-map', finalLabel,
    '-map', '0:a?',                    // 원본 오디오 유지 (없을 수도 있음)
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '23',
    '-c:a', 'copy',
    '-movflags', '+faststart',
    '-y',
    opts.outputPath,
  );

  return new Promise((resolve, reject) => {
    const proc = spawn(PATHS.ffmpeg, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      if (code !== 0) {
        console.error(`[broll-compose] failed code=${code}\n${stderr.slice(-1500)}`);
        // fallback: 원본 그대로 사용
        try {
          fs.copyFileSync(opts.inputClipPath, opts.outputPath);
          resolve(opts.outputPath);
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
        return;
      }
      resolve(opts.outputPath);
    });
  });
}

/**
 * 간단한 keyword → overlay 스케줄러. 길이 N초 클립에서 첫 키워드는 1초 후,
 * 그 다음은 lastEnd+4초 이상 간격으로 배치.
 *
 * 호출자가 keyword별로 broll 파일을 미리 받아놨다고 가정. 각 overlay 3.5초.
 */
export function planBrollSchedule(
  brolls: Array<{ keyword: string; brollPath: string }>,
  clipDurationSec: number,
  perOverlaySec: number = 3.5,
): BrollOverlay[] {
  const out: BrollOverlay[] = [];
  let cursor = 1.0; // 첫 overlay는 1초 후 (hook 첫인상 보호)
  for (const b of brolls) {
    if (cursor + perOverlaySec > clipDurationSec - 1) break;
    out.push({ brollPath: b.brollPath, startSec: cursor, durationSec: perOverlaySec });
    cursor += perOverlaySec + 4; // 다음 overlay는 4초 간격
  }
  return out;
}

/** broll 결과 캐시 경로 helper */
export function brollComposedDir(): string {
  const dir = path.join(PATHS.data, 'broll-composed');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}
