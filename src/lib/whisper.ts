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
        const userMessage = '오디오 압축에 실패했습니다. 영상 파일이 손상되었거나 디스크 공간이 부족할 수 있어요.';
        emitProgress({
          projectId,
          step: 'transcribe',
          status: 'error',
          progress: 0,
          message: userMessage,
          detail: stderr.slice(-300),
        });
        console.error(`[whisper.compress] failed (code ${code}):`, stderr.slice(-500));
        reject(new Error(userMessage));
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

  // maxRetries 5 + 10분 timeout — 큰 파일 업로드 + 일시적 네트워크 에러 대응.
  // 기본 2회 재시도로는 부족했음 (외부 사용자 보고 사례).
  const client = new OpenAI({ apiKey: openaiApiKey, maxRetries: 5, timeout: 600_000 });

  let transcription;
  try {
    transcription = await client.audio.transcriptions.create({
      file: fs.createReadStream(pp.audioMp3),
      model: 'whisper-1',
      language: 'ko',
      response_format: 'verbose_json',
      timestamp_granularities: ['word', 'segment'],
    });
  } catch (err) {
    // OpenAI SDK 에러 분류 → 사용자 친화 메시지
    const e = err as { status?: number; message?: string; code?: string };
    console.error('[whisper] OpenAI API error:', e.status, e.message);
    if (e.status === 401) {
      throw new Error('OpenAI API 키가 잘못되었습니다. 우상단 설정에서 다시 확인해주세요.');
    }
    if (e.status === 429) {
      throw new Error('OpenAI 사용량 한도에 도달했어요. 잠시 후 다시 시도하거나 OpenAI 대시보드에서 결제 정보를 확인해주세요.');
    }
    if (e.status === 413) {
      throw new Error('오디오 파일이 너무 큽니다. 영상 길이를 줄여주세요.');
    }
    if (typeof e.status === 'number' && e.status >= 500) {
      throw new Error('OpenAI 서버에 일시적 문제가 있어요. 잠시 후 다시 시도해주세요.');
    }
    throw new Error(`음성 인식 중 오류가 발생했습니다: ${e.message || '알 수 없는 오류'}`);
  }

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
