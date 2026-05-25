"use client";

import type { WizardStep } from "@/lib/capcut/types";

const STEPS: { id: WizardStep; label: string }[] = [
  { id: 1, label: "영상 audio 업로드" },
  { id: 2, label: "자동 분석" },
  { id: 3, label: "자막 + 포인트 검수" },
  { id: 4, label: "캡컷 패키지 다운로드" },
];

export default function StepIndicator({ current }: { current: WizardStep }) {
  return (
    <div className="flex items-center gap-2 mb-6 flex-wrap">
      {STEPS.map((s, i) => {
        const done = current > s.id;
        const active = current === s.id;
        return (
          <div key={s.id} className="flex items-center gap-2">
            <div className={active ? "" : done ? "opacity-100" : "opacity-50"}>
              <span
                className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${
                  done
                    ? "bg-success text-white"
                    : active
                      ? "bg-brand text-white"
                      : "bg-line text-mute"
                }`}
              >
                {done ? "✓" : s.id}
              </span>
              <span
                className={`ml-2 text-sm font-semibold ${
                  active ? "text-ink" : "text-sub"
                }`}
              >
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <span className={`w-6 h-px ${done ? "bg-success" : "bg-line"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
