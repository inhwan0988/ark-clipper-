"use client";

import { useState } from "react";
import { useWizard } from "./WizardContext";
import {
  matchSoundEffect,
  SOUND_CATEGORY_LABELS,
  SOUND_LIBRARY,
} from "@/lib/capcut/sound-library";
import type {
  PointSubtitle,
  SoundEffect,
  SubtitleSegment,
} from "@/lib/capcut/types";

export default function Step3Review() {
  const {
    result,
    editedSubtitles,
    setEditedSubtitles,
    editedPoints,
    setEditedPoints,
    setStep,
  } = useWizard();

  const [tab, setTab] = useState<"summary" | "subs" | "points" | "silences">(
    "summary",
  );

  if (!result) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-ink">검수 + 수정</h2>
          <p className="text-sm text-sub mt-0.5">
            AI 결과를 확인하고 수정하세요. 끝나면 캡컷 패키지를 다운로드합니다.
          </p>
        </div>
        <button
          onClick={() => setStep(1)}
          className="text-sm font-semibold text-sub hover:text-ink"
        >
          ← 다시 업로드
        </button>
      </div>

      {/* 요약 카드 */}
      <SummaryCard
        duration={result.duration}
        subsCount={editedSubtitles.length}
        silencesCount={result.silences.length}
        silencesTotal={result.silences.reduce((s, x) => s + x.duration, 0)}
        pointsCount={editedPoints.length}
      />

      {/* Tab 선택 */}
      <div className="flex gap-1 border-b border-line">
        {[
          { id: "summary", label: "📊 요약" },
          { id: "subs", label: `📝 자막 (${editedSubtitles.length})` },
          { id: "points", label: `🎯 포인트 자막 (${editedPoints.length})` },
          { id: "silences", label: `✂️ 무음 컷 (${result.silences.length})` },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as typeof tab)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 transition ${
              tab === t.id
                ? "border-brand text-brand"
                : "border-transparent text-sub hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab 내용 */}
      {tab === "summary" && <SummaryTab />}
      {tab === "subs" && (
        <SubsTab subs={editedSubtitles} onChange={setEditedSubtitles} />
      )}
      {tab === "points" && (
        <PointsTab points={editedPoints} onChange={setEditedPoints} />
      )}
      {tab === "silences" && <SilencesTab silences={result.silences} />}

      <div className="flex justify-end pt-4 border-t border-line">
        <button
          onClick={() => setStep(4)}
          className="rounded-xl bg-brand px-8 py-3 text-sm font-bold text-white hover:bg-brandHover"
        >
          캡컷 패키지 만들기 →
        </button>
      </div>
    </div>
  );
}

function SummaryCard({
  duration,
  subsCount,
  silencesCount,
  silencesTotal,
  pointsCount,
}: {
  duration: number;
  subsCount: number;
  silencesCount: number;
  silencesTotal: number;
  pointsCount: number;
}) {
  const trimmed = Math.max(0, duration - silencesTotal);
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <Stat label="총 길이" value={formatTime(duration)} />
      <Stat
        label="컷 후 길이"
        value={formatTime(trimmed)}
        sub={`-${formatTime(silencesTotal)} (무음)`}
        emphasis
      />
      <Stat label="자막" value={`${subsCount}줄`} />
      <Stat label="포인트 자막" value={`${pointsCount}개`} />
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  emphasis,
}: {
  label: string;
  value: string;
  sub?: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={`rounded-xl2 p-3 border ${
        emphasis ? "border-success/40 bg-success/10" : "border-line bg-surface"
      }`}
    >
      <p className="text-[10px] font-bold text-mute uppercase tracking-wider mb-1">
        {label}
      </p>
      <p
        className={`text-lg font-bold ${
          emphasis ? "text-success" : "text-ink"
        }`}
      >
        {value}
      </p>
      {sub && <p className="text-[10px] text-sub mt-0.5">{sub}</p>}
    </div>
  );
}

function SummaryTab() {
  const { result, editedPoints } = useWizard();
  if (!result) return null;
  return (
    <div className="space-y-4">
      <div className="rounded-xl2 border border-line bg-surface p-5">
        <h3 className="text-sm font-bold text-ink mb-3">📋 분석 결과 요약</h3>
        <ul className="space-y-2 text-sm text-sub">
          <li>
            ✓ 한국어 자막 <b className="text-ink">{result.subtitles.length}줄</b>{" "}
            추출 완료
          </li>
          <li>
            ✓ 무음 구간 <b className="text-ink">{result.silences.length}개</b>{" "}
            감지 — 총{" "}
            <b className="text-ink">
              {formatTime(result.silences.reduce((s, x) => s + x.duration, 0))}
            </b>{" "}
            잘라낼 수 있어요
          </li>
          <li>
            ✓ 포인트 자막 <b className="text-ink">{editedPoints.length}개</b>{" "}
            식별
          </li>
          <li>
            ✓ 각 포인트에 어울리는 효과음 자동 매칭
          </li>
        </ul>
      </div>

      <div className="rounded-xl2 border border-brand/30 bg-brandSoft/30 p-5">
        <h3 className="text-sm font-bold text-ink mb-2">
          🎬 다음 단계
        </h3>
        <ol className="space-y-1 text-sm text-sub list-decimal list-inside">
          <li>위 탭들에서 자막/포인트/무음 컷을 확인 + 수정</li>
          <li>오른쪽 아래 &ldquo;캡컷 패키지 만들기&rdquo; 클릭</li>
          <li>.srt 자막 + 효과음 + 가이드 문서 다운로드</li>
          <li>캡컷에서 import + 가이드대로 적용</li>
        </ol>
      </div>
    </div>
  );
}

function SubsTab({
  subs,
  onChange,
}: {
  subs: SubtitleSegment[];
  onChange: (s: SubtitleSegment[]) => void;
}) {
  return (
    <div className="space-y-2 max-h-[600px] overflow-y-auto">
      {subs.map((sub, i) => (
        <div
          key={i}
          className="rounded-lg border border-line bg-surface p-3 flex gap-3 items-start"
        >
          <span className="shrink-0 text-[11px] font-mono text-mute pt-1">
            {formatTime(sub.start)}
          </span>
          <textarea
            value={sub.text}
            onChange={(e) => {
              const next = [...subs];
              next[i] = { ...sub, text: e.target.value };
              onChange(next);
            }}
            rows={1}
            className="flex-1 bg-transparent text-sm text-ink resize-none focus:outline-none"
          />
          <span className="shrink-0 text-[11px] font-mono text-mute pt-1">
            {(sub.end - sub.start).toFixed(1)}s
          </span>
        </div>
      ))}
    </div>
  );
}

function PointsTab({
  points,
  onChange,
}: {
  points: PointSubtitle[];
  onChange: (p: PointSubtitle[]) => void;
}) {
  function updatePoint(i: number, patch: Partial<PointSubtitle>) {
    const next = [...points];
    next[i] = { ...next[i], ...patch };
    onChange(next);
  }
  function deletePoint(i: number) {
    onChange(points.filter((_, idx) => idx !== i));
  }
  return (
    <div className="space-y-3 max-h-[600px] overflow-y-auto">
      {points.map((p, i) => (
        <div
          key={p.id}
          className="rounded-xl2 border border-line bg-surface p-4 space-y-2"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-brand">
                {formatTime(p.time)}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 bg-chip rounded font-semibold text-mute">
                {p.style ?? "emphasis"}
              </span>
            </div>
            <button
              onClick={() => deletePoint(i)}
              className="text-[11px] text-mute hover:text-danger"
            >
              삭제
            </button>
          </div>

          <input
            type="text"
            value={p.text}
            onChange={(e) => updatePoint(i, { text: e.target.value })}
            placeholder="포인트 자막 텍스트"
            className="w-full bg-chip rounded-lg px-3 py-2 text-sm font-bold text-ink focus:outline-none focus:bg-white"
          />

          {p.sourceText && (
            <p className="text-[11px] text-mute italic">
              원문: &ldquo;{p.sourceText}&rdquo;
            </p>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-bold text-sub">🎵 효과음:</span>
            <select
              value={p.soundEffect?.id ?? ""}
              onChange={(e) => {
                const eff =
                  SOUND_LIBRARY.find((s) => s.id === e.target.value) ?? null;
                updatePoint(i, { soundEffect: eff });
              }}
              className="text-[12px] bg-chip rounded px-2 py-1 focus:outline-none"
            >
              <option value="">(없음)</option>
              {Object.entries(SOUND_CATEGORY_LABELS).map(([cat, label]) => (
                <optgroup key={cat} label={label}>
                  {SOUND_LIBRARY.filter((s) => s.category === cat).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <button
              onClick={() => {
                const auto = matchSoundEffect(p.style, undefined);
                updatePoint(i, { soundEffect: auto });
              }}
              className="text-[10px] text-brand hover:underline"
            >
              자동 재매칭
            </button>
          </div>
        </div>
      ))}

      {points.length === 0 && (
        <div className="text-center py-8 text-sub text-sm">
          포인트 자막이 없어요. 이전 단계로 돌아가서 다시 시도하세요.
        </div>
      )}
    </div>
  );
}

function SilencesTab({
  silences,
}: {
  silences: Array<{
    start: number;
    end: number;
    duration: number;
    type: string;
  }>;
}) {
  return (
    <div className="space-y-2 max-h-[600px] overflow-y-auto">
      <p className="text-xs text-sub mb-2">
        아래 무음 구간을 캡컷에서 잘라내면 영상이 더 깔끔해져요. (가이드 문서에도 포함됩니다)
      </p>
      {silences.map((s, i) => (
        <div
          key={i}
          className="rounded-lg border border-line bg-surface p-3 flex items-center gap-3"
        >
          <span className="text-[11px] font-mono text-mute">
            {formatTime(s.start)} → {formatTime(s.end)}
          </span>
          <span className="flex-1 text-xs text-sub">
            {s.type === "leading"
              ? "🎬 영상 시작"
              : s.type === "trailing"
                ? "🎬 영상 끝"
                : "🎬 중간"}
          </span>
          <span className="text-[11px] font-bold text-danger">
            -{s.duration.toFixed(1)}초
          </span>
        </div>
      ))}
      {silences.length === 0 && (
        <div className="text-center py-8 text-sub text-sm">
          잘라낼 무음 구간이 없어요. 이미 깔끔한 영상입니다!
        </div>
      )}
    </div>
  );
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.round((sec - Math.floor(sec)) * 100);
  return `${m}:${s.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
}
