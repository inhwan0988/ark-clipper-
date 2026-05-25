"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  PointSubtitle,
  ProcessResult,
  SubtitleSegment,
  WizardStep,
} from "@/lib/capcut/types";

type State = {
  step: WizardStep;
  audioFile: File | null;
  result: ProcessResult | null;
  // 검수 단계 — 수정된 자막/포인트
  editedSubtitles: SubtitleSegment[];
  editedPoints: PointSubtitle[];
  // API 키
  openaiApiKey: string;
  anthropicApiKey: string;
  isLoading: boolean;
  error: string | null;
};

type Actions = {
  setStep: (s: WizardStep) => void;
  setAudioFile: (f: File | null) => void;
  setResult: (r: ProcessResult | null) => void;
  setEditedSubtitles: (s: SubtitleSegment[]) => void;
  setEditedPoints: (p: PointSubtitle[]) => void;
  setOpenaiApiKey: (k: string) => void;
  setAnthropicApiKey: (k: string) => void;
  setLoading: (l: boolean) => void;
  setError: (e: string | null) => void;
  reset: () => void;
};

const Ctx = createContext<(State & Actions) | null>(null);

export function WizardProvider({ children }: { children: ReactNode }) {
  const [step, setStep] = useState<WizardStep>(1);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [result, setResult] = useState<ProcessResult | null>(null);
  const [editedSubtitles, setEditedSubtitles] = useState<SubtitleSegment[]>([]);
  const [editedPoints, setEditedPoints] = useState<PointSubtitle[]>([]);
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [anthropicApiKey, setAnthropicApiKey] = useState("");
  const [isLoading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStep(1);
    setAudioFile(null);
    setResult(null);
    setEditedSubtitles([]);
    setEditedPoints([]);
    setError(null);
    setLoading(false);
  }, []);

  const value = useMemo(
    () => ({
      step,
      audioFile,
      result,
      editedSubtitles,
      editedPoints,
      openaiApiKey,
      anthropicApiKey,
      isLoading,
      error,
      setStep,
      setAudioFile,
      setResult,
      setEditedSubtitles,
      setEditedPoints,
      setOpenaiApiKey,
      setAnthropicApiKey,
      setLoading,
      setError,
      reset,
    }),
    [
      step,
      audioFile,
      result,
      editedSubtitles,
      editedPoints,
      openaiApiKey,
      anthropicApiKey,
      isLoading,
      error,
      reset,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWizard() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWizard must be used within WizardProvider");
  return v;
}
