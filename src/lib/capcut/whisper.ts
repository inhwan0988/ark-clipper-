import OpenAI, { toFile } from "openai";
import type { SubtitleSegment, Word } from "./types";

/**
 * mp3 파일 buffer → Whisper API → 단어별 timestamp 포함 transcript.
 * OpenAI 사용자 키 BYOK.
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  filename: string,
  apiKey: string,
): Promise<{
  segments: SubtitleSegment[];
  duration: number;
  language: string;
}> {
  const client = new OpenAI({ apiKey, maxRetries: 3, timeout: 120_000 });

  // OpenAI SDK의 toFile utility — Buffer/Uint8Array를 안전하게 File로 변환.
  const file = await toFile(audioBuffer, filename, { type: "audio/mpeg" });

  const transcription = await client.audio.transcriptions.create({
    file,
    model: "whisper-1",
    language: "ko",
    response_format: "verbose_json",
    timestamp_granularities: ["word", "segment"],
  });

  // Whisper 응답 구조 (verbose_json + word timestamps)
  type WhisperResp = {
    segments?: Array<{ start: number; end: number; text: string }>;
    words?: Array<{ word: string; start: number; end: number }>;
    duration?: number;
    language?: string;
  };
  const data = transcription as unknown as WhisperResp;

  const allWords: Word[] = (data.words ?? []).map((w) => ({
    word: w.word.trim(),
    start: Math.round(w.start * 1000) / 1000,
    end: Math.round(w.end * 1000) / 1000,
  }));

  const segments: SubtitleSegment[] = (data.segments ?? []).map((seg) => {
    const segWords = allWords.filter(
      (w) => w.start >= seg.start - 0.05 && w.end <= seg.end + 0.05,
    );
    return {
      start: Math.round(seg.start * 1000) / 1000,
      end: Math.round(seg.end * 1000) / 1000,
      text: seg.text.trim(),
      words: segWords,
    };
  });

  return {
    segments,
    duration: data.duration ?? 0,
    language: data.language ?? "ko",
  };
}
