import Anthropic from "@anthropic-ai/sdk";
import { createWithFallback } from "@/lib/claude-models";
import type { PointSubtitle, SubtitleSegment } from "./types";

/**
 * Claude로 transcript 분석 → 강조할 부분 (포인트 자막) 식별.
 * 각 포인트는 짧은 강조 텍스트 + 스타일 + 어울리는 효과음 카테고리 추천.
 *
 * 예: "회당 3억!!" (shock + impact sound)
 *     "이게 중요한 거예요" (emphasis + ding)
 */
export async function detectPointSubtitles(
  segments: SubtitleSegment[],
  anthropicApiKey: string,
  targetCount: number = 8,
): Promise<PointSubtitle[]> {
  // 전체 transcript를 시간 정보와 함께 prompt에 넣음
  const transcriptText = segments
    .map((s) => `[${formatTime(s.start)}] ${s.text}`)
    .join("\n");

  const client = new Anthropic({
    apiKey: anthropicApiKey,
    maxRetries: 3,
    timeout: 120_000,
  });

  const prompt = `당신은 한국어 영상 콘텐츠의 강조 포인트를 찾는 전문가입니다.

다음은 영상의 자막입니다 (시간 마커 포함):

${transcriptText}

이 자막에서 **시청자가 임팩트를 받을 만한 순간** ${targetCount}개를 찾아주세요.
각 순간에 캡컷에서 "포인트 자막" + "효과음"을 넣으면 영상의 retention이 크게 올라갑니다.

선택 기준:
- 충격적/놀라운 사실 ("회당 3억!!")
- 핵심 메시지 ("이게 중요한 거예요")
- 반전 / 결론 ("그런데 사실은...")
- 숫자 강조 ("100만 명이 봤어요")
- 후킹 멘트 (시청자가 멈춰 보는 순간)

각 포인트:
- time: 자막의 시간 (초, 자막 시작 시간 또는 핵심 단어가 나오는 시간)
- duration: 포인트 자막 표시 지속 시간 (1.5-2.5초 추천)
- text: 화면에 띄울 강조 텍스트 (8-15자, 임팩트 강하게)
- emoji: 어울리는 이모지 (1-2개)
- style: "shock" | "emphasis" | "callout" | "punchline" 중 하나
- soundCategory: "pop" | "ding" | "woosh" | "impact" | "comic" | "applause" | "transition" 중 어울리는 것
- sourceText: 원본 자막의 어느 부분인지 (사용자가 확인용)

⚠️ JSON 규칙:
- 큰따옴표. 문자열 안 큰따옴표는 작은따옴표로
- 응답은 [ 시작 ] 종료. 코드블록 X.

응답:
[
  {
    "id": 1,
    "time": 45.2,
    "duration": 2,
    "text": "회당 3억!!",
    "emoji": "💸",
    "style": "shock",
    "soundCategory": "impact",
    "sourceText": "그래서 회당 3억씩 벌었어요"
  }
]`;

  const res = await createWithFallback(client, {
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });
  const text = res.content[0]?.type === "text" ? res.content[0].text : "";
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error("AI 응답에서 JSON을 찾지 못했습니다.");
  let parsed: Array<{
    id: number;
    time: number;
    duration?: number;
    text: string;
    emoji?: string;
    style?: PointSubtitle["style"];
    soundCategory?: string;
    sourceText?: string;
  }>;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    parsed = JSON.parse(match[0].replace(/,(\s*[}\]])/g, "$1"));
  }
  return parsed.map((p, i) => ({
    id: p.id ?? i + 1,
    time: p.time,
    duration: p.duration ?? 2,
    text: p.text,
    emoji: p.emoji,
    style: p.style ?? "emphasis",
    sourceText: p.sourceText,
    soundEffect: null, // sound matcher에서 채움
  }));
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}
