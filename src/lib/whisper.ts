import { spawn } from 'child_process';
import fs from 'fs';
import OpenAI from 'openai';
import { PATHS } from './paths';
import { getProjectPaths } from './db';
import { emitProgress } from './progress-bus';
import { updateProject } from './db';
import type { Transcript } from '@/types';

/**
 * OpenAI Whisper API 25MB 한도 우회를 위한 오디오 압축.
 * audio.wav (16kHz mono) → audio.mp3 (64kbps).
 * 분당 약 0.5MB → 1시간 영상 = ~30MB.
 */
async function compressToMp3(
  projectId: string,
  inputWav: string,
  outputMp3: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      '-i', inputWav,
      '-vn',
      '-acodec', 'libmp3lame',
      '-b:a', '64k',
      '-ar', '16000',
      '-ac', '1',
      '-y',
      outputMp3,
    ];
    const proc = spawn(PATHS.ffmpeg, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      if (code !== 0) {
        emitProgress({
          projectId,
          step: 'transcribe',
          status: 'error',
          progress: 0,
          message: '오디오 압축 실패',
          detail: stderr.slice(-300),
        });
        reject(new Error(`mp3 compression failed (exit ${code}): ${stderr.slice(-300)}`));
        return;
      }
      resolve();
    });
  });
}

/**
 * OpenAI Whisper API로 한국어 음성을 텍스트로 변환.
 * 사용자 본인 OpenAI API 키를 사용 (BYOK).
 */
export async function transcribe(
  projectId: string,
  openaiApiKey: string,
): Promise<Transcript> {
  const pp = getProjectPaths(projectId);

  if (!openaiApiKey || !openaiApiKey.trim()) {
    throw new Error('OpenAI API 키가 필요합니다. 우상단 설정에서 입력해주세요.');
  }

  updateProject(projectId, { status: 'transcribing' });
  emitProgress({
    projectId,
    step: 'transcribe',
    status: 'running',
    progress: 5,
    message: '오디오 압축 중...',
  });

  await compressToMp3(projectId, pp.audio, pp.audioMp3);

  const mp3Size = fs.statSync(pp.audioMp3).size;
  const mp3SizeMb = mp3Size / (1024 * 1024);

  if (mp3SizeMb > 24.5) {
    throw new Error(
      `압축 후에도 오디오 크기가 ${mp3SizeMb.toFixed(1)}MB로 OpenAI Whisper API 한도(25MB)를 초과합니다. 영상 길이를 줄여주세요.`,
    );
  }

  emitProgress({
    projectId,
    step: 'transcribe',
    status: 'running',
    progress: 20,
    message: `Whisper API 호출 중... (${mp3SizeMb.toFixed(1)}MB)`,
  });

  const client = new OpenAI({ apiKey: openaiApiKey });

  const transcription = await client.audio.transcriptions.create({
    file: fs.createReadStream(pp.audioMp3),
    model: 'whisper-1',
    language: 'ko',
    response_format: 'verbose_json',
    timestamp_granularities: ['word', 'segment'],
  });

  emitProgress({
    projectId,
    step: 'transcribe',
    status: 'running',
    progress: 90,
    message: '결과 변환 중...',
  });

  type OpenAIWord = { word: string; start: number; end: number };
  type OpenAISegment = { start: number; end: number; text: string };
  const apiResp = transcription as unknown as {
    segments?: OpenAISegment[];
    words?: OpenAIWord[];
    duration?: number;
    language?: string;
    text?: string;
  };

  const allWords = apiResp.words ?? [];
  const segments = (apiResp.segments ?? []).map((seg) => {
    const segWords = allWords
      .filter((w) => w.start >= seg.start - 0.05 && w.end <= seg.end + 0.05)
      .map((w) => ({
        word: w.word.trim(),
        start: Math.round(w.start * 1000) / 1000,
        end: Math.round(w.end * 1000) / 1000,
      }));
    return {
      start: Math.round(seg.start * 1000) / 1000,
      end: Math.round(seg.end * 1000) / 1000,
      text: seg.text.trim(),
      words: segWords,
    };
  });

  const result: Transcript = {
    segments,
    language: apiResp.language || 'ko',
    duration: apiResp.duration || 0,
  };

  fs.writeFileSync(pp.transcript, JSON.stringify(result, null, 2), 'utf-8');

  // 압축본 정리 + 원본 wav도 공간 확보용 정리 (기존 동작 유지)
  try { fs.unlinkSync(pp.audioMp3); } catch { /* ignore */ }
  try { if (fs.existsSync(pp.audio)) fs.unlinkSync(pp.audio); } catch { /* ignore */ }

  updateProject(projectId, { status: 'transcribed' });

  emitProgress({
    projectId,
    step: 'transcribe',
    status: 'complete',
    progress: 100,
    message: `음성 인식 완료 (${segments.length}개 구간)`,
  });

  return result;
}
