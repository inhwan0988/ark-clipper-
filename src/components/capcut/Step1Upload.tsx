"use client";

import { useCallback, useRef, useState } from "react";
import { useWizard } from "./WizardContext";
import type { ProcessResult } from "@/lib/capcut/types";

export default function Step1Upload() {
  const {
    audioFile,
    setAudioFile,
    openaiApiKey,
    anthropicApiKey,
    setResult,
    setEditedSubtitles,
    setEditedPoints,
    setStep,
    isLoading,
    setLoading,
    error,
    setError,
  } = useWizard();

  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback(
    (f: File) => {
      if (!f.type.startsWith("audio/") && !f.name.endsWith(".mp3")) {
        setError("mp3 파일만 업로드 가능해요.");
        return;
      }
      const MAX = 24.5 * 1024 * 1024;
      if (f.size > MAX) {
        setError(
          `파일이 너무 커요 (${(f.size / 1024 / 1024).toFixed(1)}MB). 24MB 미만으로 압축해주세요.`,
        );
        return;
      }
      setError(null);
      setAudioFile(f);
    },
    [setAudioFile, setError],
  );

  async function processFile() {
    if (!audioFile) return;
    if (!openaiApiKey || !anthropicApiKey) {
      setError("우상단에서 OpenAI + Claude API 키를 모두 입력해주세요.");
      return;
    }
    setLoading(true);
    setError(null);
    setStep(2);

    const fd = new FormData();
    fd.append("audio", audioFile);
    fd.append("openaiApiKey", openaiApiKey);
    fd.append("anthropicApiKey", anthropicApiKey);
    fd.append("targetPointCount", "8");

    try {
      const res = await fetch("/api/capcut/process", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "처리 실패");
      }
      const data = (await res.json()) as { result: ProcessResult };
      setResult(data.result);
      setEditedSubtitles(data.result.subtitles);
      setEditedPoints(data.result.points);
      setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류");
      setStep(1);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-ink mb-2">
          캡컷에 올린 영상의 audio를 업로드해주세요
        </h2>
        <p className="text-sm text-sub leading-relaxed">
          캡컷에서 <b className="text-ink">Export → Audio (mp3)</b> 추출 후 업로드하면, AI가 자막 + 무음 컷 + 포인트 자막 + 효과음을 자동으로 만들어드립니다.
        </p>
      </div>

      {/* 업로드 zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files[0];
          if (f) handleFile(f);
        }}
        onClick={() => inputRef.current?.click()}
        className={`rounded-xl2 border-2 border-dashed p-12 text-center cursor-pointer transition ${
          dragOver ? "border-brand bg-brandSoft/40" : "border-line bg-surface hover:border-brand"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="audio/mpeg,audio/mp3,.mp3"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
          className="hidden"
        />
        {audioFile ? (
          <div>
            <p className="text-4xl mb-3">🎵</p>
            <p className="text-sm font-bold text-ink">{audioFile.name}</p>
            <p className="text-xs text-mute mt-1">
              {(audioFile.size / 1024 / 1024).toFixed(2)} MB
            </p>
            <p className="text-[11px] text-sub mt-3">
              파일 변경하려면 클릭 또는 드래그
            </p>
          </div>
        ) : (
          <div>
            <p className="text-4xl mb-3">📁</p>
            <p className="text-sm font-semibold text-ink">
              mp3 파일을 드래그하거나 클릭해서 선택
            </p>
            <p className="text-xs text-mute mt-2">최대 24MB · 30분 미만 권장</p>
          </div>
        )}
      </div>

      {audioFile && (
        <button
          onClick={processFile}
          disabled={isLoading}
          className="w-full rounded-xl bg-brand py-3 text-sm font-bold text-white hover:bg-brandHover disabled:opacity-50"
        >
          {isLoading ? "처리 중..." : "AI 자동 분석 시작 →"}
        </button>
      )}

      {error && (
        <div className="rounded-xl border border-danger/30 bg-dangerSoft px-4 py-3 text-sm font-semibold text-danger">
          ⚠️ {error}
        </div>
      )}

      {/* 캡컷에서 mp3 추출하는 법 */}
      <div className="rounded-xl2 border border-line bg-surface p-5 mt-6">
        <h3 className="text-sm font-bold text-ink mb-3">
          💡 캡컷에서 mp3 추출하는 법 (1분)
        </h3>
        <ol className="space-y-1.5 text-xs text-sub list-decimal list-inside">
          <li>캡컷 데스크탑에서 영상 import (보통 하는 작업)</li>
          <li>
            상단 메뉴 <b className="text-ink">Export</b> → format을 <b className="text-ink">Audio (MP3)</b>로 변경
          </li>
          <li>bitrate 64-128kbps 권장 (작을수록 업로드 빠름)</li>
          <li>저장된 mp3를 여기 업로드</li>
        </ol>
      </div>
    </div>
  );
}
