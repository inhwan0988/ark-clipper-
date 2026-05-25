"use client";

import Link from "next/link";
import { WizardProvider, useWizard } from "@/components/capcut/WizardContext";
import SettingsBar from "@/components/capcut/SettingsBar";
import StepIndicator from "@/components/capcut/StepIndicator";
import Step1Upload from "@/components/capcut/Step1Upload";
import Step2Processing from "@/components/capcut/Step2Processing";
import Step3Review from "@/components/capcut/Step3Review";
import Step4Export from "@/components/capcut/Step4Export";

export default function CapcutPage() {
  return (
    <WizardProvider>
      <div
        className="capcut-light-theme min-h-screen flex flex-col"
        style={{ background: "#F9FAFB", color: "#191F28" }}
      >
        <SettingsBar />
        <div className="max-w-4xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 flex-1">
          <div className="mb-6">
            <Link
              href="/"
              className="text-sm font-semibold text-brand hover:underline"
            >
              ← Ark Clipper 메인으로
            </Link>
          </div>
          <IndicatorAndBody />
        </div>
        <footer className="border-t border-line bg-surface text-xs text-mute py-4 text-center">
          캡컷 반자동 편집 (BETA) — mp3 업로드 → 자막 + 무음 컷 + 포인트 자막 + 효과음 자동 생성
        </footer>
      </div>
    </WizardProvider>
  );
}

function IndicatorAndBody() {
  const { step } = useWizard();
  return (
    <>
      <StepIndicator current={step} />
      <div className="mt-8">
        <StepBody />
      </div>
    </>
  );
}

function StepBody() {
  const { step } = useWizard();
  if (step === 1) return <Step1Upload />;
  if (step === 2) return <Step2Processing />;
  if (step === 3) return <Step3Review />;
  if (step === 4) return <Step4Export />;
  return null;
}
