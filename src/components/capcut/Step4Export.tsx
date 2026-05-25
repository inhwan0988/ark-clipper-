"use client";

import { useEffect, useState } from "react";
import { useWizard } from "./WizardContext";

type ExportData = {
  srt: string;
  cutGuide: string;
  pointGuide: string;
  summary: {
    totalDuration: number;
    subtitleCount: number;
    silenceCount: number;
    silenceTotalSec: number;
    pointCount: number;
  };
};

export default function Step4Export() {
  const { result, editedSubtitles, editedPoints, setStep, reset } = useWizard();
  const [data, setData] = useState<ExportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!result) return;
    setLoading(true);
    fetch("/api/capcut/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        result: {
          ...result,
          subtitles: editedSubtitles,
          points: editedPoints,
        },
        wrapMaxChars: 18,
      }),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? "export 실패");
        return r.json();
      })
      .then((d: ExportData) => setData(d))
      .catch((e) =>
        setError(e instanceof Error ? e.message : "오류"),
      )
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function downloadText(filename: string, content: string) {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function downloadAll() {
    if (!data) return;
    downloadText("subtitles.srt", data.srt);
    setTimeout(() => downloadText("cut_guide.txt", data.cutGuide), 300);
    setTimeout(() => downloadText("point_guide.txt", data.pointGuide), 600);
  }

  if (loading || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand border-t-transparent" />
        <p className="mt-4 text-sm font-bold text-ink">패키지 생성 중...</p>
        {error && (
          <p className="mt-2 text-sm text-danger font-semibold">{error}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-ink">캡컷 패키지 다운로드</h2>
          <p className="text-sm text-sub mt-0.5">
            아래 파일들을 캡컷에 import하면 자동으로 적용됩니다.
          </p>
        </div>
        <button
          onClick={() => setStep(3)}
          className="text-sm font-semibold text-sub hover:text-ink"
        >
          ← 검수 단계
        </button>
      </div>

      {/* 다운로드 카드 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <DownloadCard
          icon="📝"
          title="자막 (.srt)"
          desc="캡컷 자동 자막 import"
          size={`${data.summary.subtitleCount}줄`}
          onClick={() => downloadText("subtitles.srt", data.srt)}
        />
        <DownloadCard
          icon="✂️"
          title="컷 가이드 (.txt)"
          desc="무음 구간 timestamp 목록"
          size={`${data.summary.silenceCount}개 (-${formatTime(data.summary.silenceTotalSec)})`}
          onClick={() => downloadText("cut_guide.txt", data.cutGuide)}
        />
        <DownloadCard
          icon="🎯"
          title="포인트 + 효과음 가이드 (.txt)"
          desc="포인트 자막 + 효과음 시간 안내"
          size={`${data.summary.pointCount}개`}
          onClick={() => downloadText("point_guide.txt", data.pointGuide)}
        />
      </div>

      <button
        onClick={downloadAll}
        className="w-full rounded-xl bg-brand py-3 text-sm font-bold text-white hover:bg-brandHover"
      >
        📥 모두 한 번에 다운로드
      </button>

      {/* 캡컷에서 import하는 법 */}
      <div className="rounded-xl2 border border-line bg-surface p-5 mt-4">
        <h3 className="text-sm font-bold text-ink mb-3">
          📚 캡컷에서 적용하는 법
        </h3>
        <ol className="space-y-3 text-sm text-sub">
          <Step n={1} title="자막 import">
            캡컷 상단 메뉴 <b>Subtitles → Import subtitles</b> →{" "}
            <b className="text-brand">subtitles.srt</b> 선택 → 자동 자막 timeline에 추가됨
          </Step>
          <Step n={2} title="무음 컷">
            <b className="text-brand">cut_guide.txt</b> 열어서 timestamp 보고 캡컷 timeline에서 직접 컷
          </Step>
          <Step n={3} title="포인트 자막 + 효과음">
            <b className="text-brand">point_guide.txt</b> 열어서 시간 + 텍스트 + 효과음 정보 보고 캡컷에 추가
            <br />
            <span className="text-mute text-xs">
              (Phase 2에서 효과음 mp3 파일도 같이 패키지로 제공 예정)
            </span>
          </Step>
          <Step n={4} title="미세 조정 + Export">
            캡컷에서 색감/트랜지션 조정 후 → 영상 Export
          </Step>
        </ol>
      </div>

      <div className="flex justify-end">
        <button
          onClick={reset}
          className="rounded-xl border border-line bg-surface px-6 py-2.5 text-sm font-semibold hover:bg-chip"
        >
          새 영상 처리 →
        </button>
      </div>
    </div>
  );
}

function DownloadCard({
  icon,
  title,
  desc,
  size,
  onClick,
}: {
  icon: string;
  title: string;
  desc: string;
  size: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-xl2 border border-line bg-surface p-4 text-left hover:shadow-pop hover:border-brand transition"
    >
      <div className="text-3xl mb-2">{icon}</div>
      <h4 className="text-sm font-bold text-ink mb-0.5">{title}</h4>
      <p className="text-[11px] text-sub mb-2">{desc}</p>
      <p className="text-[11px] text-brand font-bold">{size}</p>
      <p className="text-[11px] text-mute mt-2">📥 다운로드</p>
    </button>
  );
}

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span className="shrink-0 w-6 h-6 rounded-full bg-brandSoft text-brand text-[11px] font-bold flex items-center justify-center">
        {n}
      </span>
      <div className="flex-1">
        <b className="text-ink">{title}</b>
        <div className="mt-1 text-sub">{children}</div>
      </div>
    </li>
  );
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
