import { NextRequest, NextResponse } from "next/server";
import { segmentsToSrtWrapped } from "@/lib/capcut/srt";
import type { PointSubtitle, ProcessResult } from "@/lib/capcut/types";

export const runtime = "nodejs";

type Body = {
  result: ProcessResult;
  wrapMaxChars?: number;
};

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Body;
  if (!body.result) {
    return NextResponse.json({ error: "result가 필요합니다." }, { status: 400 });
  }

  const { result } = body;
  const wrapMaxChars = body.wrapMaxChars ?? 18;

  const srt = segmentsToSrtWrapped(result.subtitles, wrapMaxChars);
  const cutGuide = buildCutGuide(result.silences);
  const pointGuide = buildPointGuide(result.points);

  return NextResponse.json({
    srt,
    cutGuide,
    pointGuide,
    summary: {
      totalDuration: result.duration,
      subtitleCount: result.subtitles.length,
      silenceCount: result.silences.length,
      silenceTotalSec: result.silences.reduce((s, x) => s + x.duration, 0),
      pointCount: result.points.length,
    },
  });
}

function buildCutGuide(silences: ProcessResult["silences"]): string {
  if (silences.length === 0) return "잘라낼 무음 구간 없음";
  const lines = ["[ 무음 구간 컷 가이드 ]"];
  lines.push("아래 구간을 캡컷에서 잘라내세요:");
  lines.push("");
  silences.forEach((s, i) => {
    lines.push(
      `${i + 1}. ${formatTime(s.start)} ~ ${formatTime(s.end)} (${s.duration.toFixed(1)}초) — ${labelType(s.type)}`,
    );
  });
  return lines.join("\n");
}

function buildPointGuide(points: PointSubtitle[]): string {
  if (points.length === 0) return "포인트 자막 없음";
  const lines = ["[ 포인트 자막 + 효과음 가이드 ]"];
  lines.push("아래 시점에 포인트 자막 + 효과음을 추가하세요:");
  lines.push("");
  points.forEach((p, i) => {
    lines.push(`${i + 1}. ${formatTime(p.time)}`);
    lines.push(`   자막: "${p.text}" ${p.emoji ?? ""}`);
    lines.push(`   효과음: ${p.soundEffect?.name ?? "(선택 안 됨)"} (${p.duration}초 표시)`);
    if (p.sourceText) {
      lines.push(`   원문 참고: "${p.sourceText}"`);
    }
    lines.push("");
  });
  return lines.join("\n");
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.round((sec - Math.floor(sec)) * 100);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
}

function labelType(t: "leading" | "middle" | "trailing"): string {
  return t === "leading" ? "영상 시작" : t === "trailing" ? "영상 끝" : "중간";
}
