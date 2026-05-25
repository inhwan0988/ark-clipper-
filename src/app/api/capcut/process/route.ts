import { NextRequest, NextResponse } from "next/server";
import { transcribeAudio } from "@/lib/capcut/whisper";
import { detectSilences } from "@/lib/capcut/silence-detector";
import { detectPointSubtitles } from "@/lib/capcut/point-detector";
import { matchSoundEffect } from "@/lib/capcut/sound-library";
import type { ProcessResult } from "@/lib/capcut/types";

export const runtime = "nodejs";

/**
 * mp3 파일 → Whisper 자막 + 무음 구간 + 포인트 자막 + 효과음 자동 매칭.
 *
 * Electron 환경에서는 timeout 제한 없음. Vercel 환경에서 호스팅된다면
 * Pro plan + maxDuration 300 필요.
 */
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const audioFile = formData.get("audio");
  const openaiApiKey = String(formData.get("openaiApiKey") || "");
  const anthropicApiKey = String(formData.get("anthropicApiKey") || "");
  const targetPointCount = Number(formData.get("targetPointCount") || 8);

  if (!audioFile || !(audioFile instanceof Blob)) {
    return NextResponse.json({ error: "audio 파일이 필요합니다." }, { status: 400 });
  }
  if (!openaiApiKey || !openaiApiKey.startsWith("sk-")) {
    return NextResponse.json({ error: "OpenAI API 키가 필요합니다." }, { status: 400 });
  }
  if (!anthropicApiKey || !anthropicApiKey.startsWith("sk-ant-")) {
    return NextResponse.json({ error: "Anthropic API 키가 필요합니다." }, { status: 400 });
  }

  // Whisper API 한도 (25MB)
  const MAX_BYTES = 24.5 * 1024 * 1024;
  if (audioFile.size > MAX_BYTES) {
    return NextResponse.json(
      {
        error: `mp3 파일이 너무 큽니다 (${(audioFile.size / 1024 / 1024).toFixed(1)}MB). 24MB 미만으로 압축해주세요.`,
      },
      { status: 400 },
    );
  }

  try {
    const arrayBuffer = await audioFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const filename = (audioFile as File).name || "audio.mp3";

    const { segments, duration, language } = await transcribeAudio(buffer, filename, openaiApiKey);
    const silences = detectSilences(segments, duration, 0.5);

    const rawPoints = await detectPointSubtitles(segments, anthropicApiKey, targetPointCount);

    const points = (rawPoints as Array<{
      id: number;
      time: number;
      duration: number;
      text: string;
      emoji?: string;
      style?: "shock" | "emphasis" | "callout" | "punchline";
      sourceText?: string;
    }>).map((p) => ({
      ...p,
      style: p.style ?? "emphasis" as const,
      soundEffect: matchSoundEffect(p.style ?? "emphasis", undefined),
    }));

    const result: ProcessResult = {
      videoId: crypto.randomUUID(),
      duration,
      subtitles: segments,
      silences,
      points,
      detectedLanguage: language,
    };
    return NextResponse.json({ result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "처리 중 오류";
    const errCode = (e as { status?: number }).status;
    console.error("[capcut/process]", msg);
    if (errCode === 401) {
      return NextResponse.json({ error: "API 키가 잘못되었어요. 우상단 설정 확인해주세요." }, { status: 401 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
