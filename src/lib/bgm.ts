/**
 * [Phase 3 / Task 3] BGM 자동 추가.
 *
 * 두 가지 경로:
 *  1) 사용자가 직접 mp3 경로 지정 (bgmPath) — 가장 단순/안정적
 *  2) Claude로 mood 분석 → 미리 정의된 mood→URL 매핑에서 BGM 다운로드
 *
 * 미리 정의 mood mapping은 외부 무료 BGM URL을 가리키지만,
 * 실제 다운로드는 사용자 환경 / 라이선스 책임이라 기본은 disabled.
 * 환경변수 ARC_BGM_LIBRARY_JSON으로 사용자 정의 매핑 주입 가능.
 *
 * ffmpeg 함수도 같은 파일에 분리 — ffmpeg-ops.ts는 만지지 않음 (Phase 1 회피).
 */
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import Anthropic from '@anthropic-ai/sdk';
import { PATHS, ensureDir } from './paths';
import { createWithFallback } from './claude-models';

export type Mood = 'calm' | 'upbeat' | 'dramatic' | 'neutral';

/** Mood → 미리 정의된 BGM URL 매핑. 환경변수 ARC_BGM_LIBRARY_JSON으로 override 가능. */
export function getMoodLibrary(): Record<Mood, string | null> {
  // 기본은 빈 — 사용자가 직접 mp3 경로 주입 권장.
  // 환경변수로 override 가능 (e.g. Pixabay/YT Audio Library 사용자 정의 URL)
  const defaultLib: Record<Mood, string | null> = {
    calm: null,
    upbeat: null,
    dramatic: null,
    neutral: null,
  };
  try {
    const raw = process.env.ARC_BGM_LIBRARY_JSON;
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Record<Mood, string>>;
      return {
        calm: parsed.calm ?? null,
        upbeat: parsed.upbeat ?? null,
        dramatic: parsed.dramatic ?? null,
        neutral: parsed.neutral ?? null,
      };
    }
  } catch (err) {
    console.warn('[bgm] ARC_BGM_LIBRARY_JSON parse failed:', err);
  }
  return defaultLib;
}

/**
 * Transcript의 일부로 mood 분석. Claude 호출 1회 → mood 문자열.
 * API 키 없거나 실패 시 'neutral' 반환.
 */
export async function analyzeMood(
  transcriptText: string,
  apiKey: string,
): Promise<Mood> {
  if (!apiKey || !apiKey.trim()) return 'neutral';
  const text = transcriptText.slice(0, 1200).trim();
  if (!text) return 'neutral';

  try {
    const client = new Anthropic({ apiKey: apiKey.trim(), maxRetries: 2, timeout: 30_000 });
    const res = await createWithFallback(client, {
      max_tokens: 30,
      temperature: 0.3,
      system: `당신은 영상 분위기 분석가입니다. 주어진 한국어 대사 일부를 보고 가장 어울리는 BGM mood를 하나만 답변합니다.
선택지(이것만 출력, 다른 단어 X): calm, upbeat, dramatic, neutral
- calm: 잔잔, 차분, 명상, 힐링
- upbeat: 활기, 즐거움, 유머, 신남
- dramatic: 긴장, 충격, 극적, 진지
- neutral: 위 3개에 명확히 안 맞는 일반적인 톤`,
      messages: [{ role: 'user', content: `대사:\n${text}\n\nmood 한 단어만 출력:` }],
    });
    const out = res.content[0].type === 'text' ? res.content[0].text : '';
    const m = out.toLowerCase().match(/(calm|upbeat|dramatic|neutral)/);
    return (m?.[1] as Mood) || 'neutral';
  } catch (err) {
    console.warn('[bgm] mood 분석 실패:', err instanceof Error ? err.message : err);
    return 'neutral';
  }
}

/** BGM 캐시 디렉토리 */
function bgmCacheDir(): string {
  const dir = path.join(PATHS.data, 'bgm-cache');
  ensureDir(dir);
  return dir;
}

/** mood library URL → 로컬 캐시 파일 다운로드 (이미 있으면 재사용) */
export async function fetchBgmForMood(mood: Mood): Promise<string | null> {
  const lib = getMoodLibrary();
  const url = lib[mood];
  if (!url) return null;
  const safeName = `mood-${mood}.mp3`;
  const out = path.join(bgmCacheDir(), safeName);
  if (fs.existsSync(out)) {
    try {
      if (fs.statSync(out).size > 1024) return out;
      fs.unlinkSync(out);
    } catch { /* ignore */ }
  }
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[bgm] download failed ${res.status} for mood=${mood}`);
      return null;
    }
    const ab = await res.arrayBuffer();
    fs.writeFileSync(out, Buffer.from(ab));
    return out;
  } catch (err) {
    console.warn('[bgm] download error:', err instanceof Error ? err.message : err);
    return null;
  }
}

export interface ComposeBgmOptions {
  /** 원본 클립 mp4 절대경로 */
  inputClipPath: string;
  /** 출력 mp4 절대경로 */
  outputPath: string;
  /** BGM 파일 절대경로 (mp3/m4a/aac/wav) */
  bgmPath: string;
  /** BGM 볼륨 (0.0~1.0). default 0.15. 원본 대비 작게 mix. */
  bgmVolume?: number;
}

/**
 * 클립에 BGM을 mix. 원본 오디오 + BGM(낮은 볼륨) amix.
 * BGM이 클립보다 길면 잘리고, 짧으면 loop.
 */
export async function composeBgm(opts: ComposeBgmOptions): Promise<string> {
  if (!fs.existsSync(opts.inputClipPath)) {
    throw new Error('원본 클립을 찾지 못했어요.');
  }
  if (!fs.existsSync(opts.bgmPath)) {
    console.warn('[bgm] BGM 파일 없음 → 원본 그대로 copy');
    fs.copyFileSync(opts.inputClipPath, opts.outputPath);
    return opts.outputPath;
  }

  const vol = Math.max(0, Math.min(1, opts.bgmVolume ?? 0.15));

  // BGM은 stream_loop=-1로 무한 loop. 클립 길이에 맞게 자동 trim.
  // duration=shortest로 클립 길이에 맞춤.
  const args = [
    '-i', opts.inputClipPath,
    '-stream_loop', '-1',
    '-i', opts.bgmPath,
    '-filter_complex',
    `[1:a]volume=${vol.toFixed(2)}[bgm];[0:a][bgm]amix=inputs=2:duration=shortest:dropout_transition=0[aout]`,
    '-map', '0:v',
    '-map', '[aout]',
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', '160k',
    '-shortest',
    '-movflags', '+faststart',
    '-y',
    opts.outputPath,
  ];

  return new Promise((resolve, reject) => {
    const proc = spawn(PATHS.ffmpeg, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      if (code !== 0) {
        console.error(`[bgm] composeBgm failed code=${code}\n${stderr.slice(-1500)}`);
        // fallback: 원본 그대로
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
 * mood → 적절한 bgmPath 자동 결정. 우선순위:
 *  1) explicit override path 인자
 *  2) ARC_BGM_LIBRARY_JSON 환경변수 매핑 → 다운로드
 *  3) null (BGM 비활성)
 */
export async function resolveBgmPath(
  mood: Mood,
  override?: string,
): Promise<string | null> {
  if (override && fs.existsSync(override)) return override;
  return await fetchBgmForMood(mood);
}
