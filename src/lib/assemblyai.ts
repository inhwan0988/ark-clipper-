/**
 * Phase 4 — Speaker Diarization via AssemblyAI
 *
 * Whisper(OpenAI)에는 화자 구분(diarization) API가 없으므로, 옵션으로 AssemblyAI를
 * 사용. 사용자가 API 키를 입력해야 활성됨 (자유 티어 월 5시간 정도).
 *
 * 흐름:
 *   1) audio 파일 업로드 → upload_url 획득
 *   2) transcript 생성 (speaker_labels: true)
 *   3) 폴링하여 완료 대기
 *   4) words/utterances → TranscriptSegment[] + speaker label 매핑
 *
 * 결과는 Whisper와 동일한 Transcript 형태 + 각 segment에 optional speaker 필드 부착.
 * subtitle-gen.ts는 직접 손대지 않고, post-process helper `attachSpeakerToText()`로
 * 자막 텍스트에 "화자A: " 접두어를 합쳐서 전달함.
 */

import fs from 'fs';
import type { Transcript, TranscriptSegment, TranscriptWord } from '@/types';

const ASSEMBLY_BASE = 'https://api.assemblyai.com/v2';

interface AssemblyUtterance {
  start: number;
  end: number;
  text: string;
  speaker: string;
  words: Array<{
    text: string;
    start: number;
    end: number;
    speaker?: string;
  }>;
}

interface AssemblyTranscriptResponse {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'error';
  error?: string;
  audio_duration?: number;
  language_code?: string;
  utterances?: AssemblyUtterance[];
  text?: string;
}

/** 화자 라벨을 한국어 표시용으로 변환 (A → "화자A") */
export function formatSpeakerLabel(speaker: string): string {
  if (!speaker) return '';
  return `화자${speaker.toUpperCase()}`;
}

/**
 * 자막 텍스트에 화자 prefix 부착 — subtitle-gen은 손대지 않고 호출 측에서 합쳐 전달.
 * 같은 화자가 연속이면 prefix를 생략해 자막이 너무 길어지지 않게 함.
 */
export function attachSpeakerToText(
  segments: TranscriptSegment[],
): TranscriptSegment[] {
  let prevSpeaker = '';
  return segments.map((seg) => {
    const sp = (seg.speaker || '').trim();
    if (!sp) {
      prevSpeaker = '';
      return seg;
    }
    const label = formatSpeakerLabel(sp);
    if (sp === prevSpeaker) {
      return seg;
    }
    prevSpeaker = sp;
    return { ...seg, text: `${label}: ${seg.text}` };
  });
}

export function isValidAssemblyKey(key: string): boolean {
  return /^[a-f0-9]{20,}$/i.test(key.trim());
}

async function uploadAudio(audioPath: string, apiKey: string): Promise<string> {
  if (!fs.existsSync(audioPath)) {
    throw new Error(`audio 파일이 없습니다: ${audioPath}`);
  }
  const buf = fs.readFileSync(audioPath);
  const res = await fetch(`${ASSEMBLY_BASE}/upload`, {
    method: 'POST',
    headers: {
      authorization: apiKey,
      'content-type': 'application/octet-stream',
    },
    body: buf,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`AssemblyAI 업로드 실패 (${res.status}): ${text}`);
  }
  const data = (await res.json()) as { upload_url: string };
  if (!data.upload_url) throw new Error('AssemblyAI 응답에 upload_url이 없습니다.');
  return data.upload_url;
}

async function createTranscript(
  uploadUrl: string,
  apiKey: string,
  languageCode: string | undefined,
): Promise<string> {
  const body: Record<string, unknown> = {
    audio_url: uploadUrl,
    speaker_labels: true,
  };
  if (languageCode) body.language_code = languageCode;
  const res = await fetch(`${ASSEMBLY_BASE}/transcript`, {
    method: 'POST',
    headers: {
      authorization: apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`AssemblyAI transcript 생성 실패 (${res.status}): ${text}`);
  }
  const data = (await res.json()) as { id: string };
  return data.id;
}

async function pollTranscript(
  id: string,
  apiKey: string,
  onProgress?: (msg: string) => void,
): Promise<AssemblyTranscriptResponse> {
  const MAX_ATTEMPTS = 360;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const res = await fetch(`${ASSEMBLY_BASE}/transcript/${id}`, {
      headers: { authorization: apiKey },
    });
    if (!res.ok) {
      throw new Error(`AssemblyAI 폴링 실패 (${res.status})`);
    }
    const data = (await res.json()) as AssemblyTranscriptResponse;
    if (data.status === 'completed') return data;
    if (data.status === 'error') {
      throw new Error(`AssemblyAI 처리 실패: ${data.error || 'unknown'}`);
    }
    if (onProgress) onProgress(`AssemblyAI ${data.status} (${i + 1}/${MAX_ATTEMPTS})`);
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error('AssemblyAI 시간 초과 (30분 대기 후 완료되지 않음)');
}

export async function transcribeWithDiarization(
  audioPath: string,
  apiKey: string,
  languageCode?: string,
  onProgress?: (msg: string) => void,
): Promise<Transcript> {
  if (!apiKey) throw new Error('AssemblyAI API 키가 필요합니다.');

  onProgress?.('오디오 업로드 중');
  const uploadUrl = await uploadAudio(audioPath, apiKey);

  onProgress?.('transcript 작업 생성');
  const id = await createTranscript(uploadUrl, apiKey, languageCode);

  onProgress?.('AssemblyAI 처리 대기');
  const result = await pollTranscript(id, apiKey, onProgress);

  const segments: TranscriptSegment[] = (result.utterances || []).map((u) => {
    const words: TranscriptWord[] = (u.words || []).map((w) => ({
      word: w.text,
      start: (w.start ?? 0) / 1000,
      end: (w.end ?? 0) / 1000,
    }));
    const seg: TranscriptSegment = {
      start: u.start / 1000,
      end: u.end / 1000,
      text: u.text,
      words,
      speaker: u.speaker,
    };
    return seg;
  });

  return {
    segments,
    language: result.language_code || languageCode || 'unknown',
    duration: result.audio_duration || 0,
  };
}
