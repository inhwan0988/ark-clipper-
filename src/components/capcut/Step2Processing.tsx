"use client";

import { useEffect, useState } from "react";
import { useWizard } from "./WizardContext";

const STAGES = [
  { label: "audio 분석 중...", duration: 3 },
  { label: "Whisper로 자막 추출 중...", duration: 30 },
  { label: "무음 구간 감지 중...", duration: 2 },
  { label: "포인트 자막 식별 중...", duration: 20 },
  { label: "효과음 매칭 중...", duration: 3 },
];

/**
 * Step2는 사실 logic을 안 갖고, 진행 상황 표시만.
 * 실제 처리는 Step1의 handleProcess가 (단일 API 호출) 진행 중이라
 * 여기는 progress 시뮬레이션 + 사용자에게 진행 표시.
 */
export default function Step2Processing() {
  const { isLoading } = useWizard();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!isLoading) return;
    const startedAt = Date.now();
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 500);
    return () => clearInterval(id);
  }, [isLoading]);

  // elapsed 기반 현재 stage 추정
  let cumul = 0;
  let currentStage = 0;
  for (let i = 0; i < STAGES.length; i++) {
    cumul += STAGES[i].duration;
    if (elapsed < cumul) {
      currentStage = i;
      break;
    }
    currentStage = i;
  }

  return (
    <div className="flex flex-col items-center justify-center py-16">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-brand border-t-transparent" />
      <p className="mt-5 text-base font-bold text-ink">
        {STAGES[currentStage]?.label ?? "처리 중..."}
      </p>
      <p className="mt-1 text-sm text-mute">
        {elapsed}초 경과 · 보통 30초~1분 소요
      </p>

      <div className="mt-6 space-y-2 max-w-md w-full">
        {STAGES.map((s, i) => (
          <div
            key={i}
            className={`flex items-center gap-2 text-xs ${
              i < currentStage
                ? "text-success font-semibold"
                : i === currentStage
                  ? "text-ink font-bold"
                  : "text-mute"
            }`}
          >
            <span>
              {i < currentStage ? "✓" : i === currentStage ? "▶" : "○"}
            </span>
            <span>{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
