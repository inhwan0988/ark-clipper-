"use client";

import { useEffect } from "react";
import { useWizard } from "./WizardContext";

export default function SettingsBar() {
  const {
    openaiApiKey,
    setOpenaiApiKey,
    anthropicApiKey,
    setAnthropicApiKey,
  } = useWizard();

  useEffect(() => {
    const oa = localStorage.getItem("apiKey_openai");
    if (oa) setOpenaiApiKey(oa);
    const an = localStorage.getItem("apiKey_claude");
    if (an) setAnthropicApiKey(an);
  }, [setOpenaiApiKey, setAnthropicApiKey]);

  useEffect(() => {
    if (openaiApiKey) localStorage.setItem("apiKey_openai", openaiApiKey);
  }, [openaiApiKey]);
  useEffect(() => {
    if (anthropicApiKey) localStorage.setItem("apiKey_claude", anthropicApiKey);
  }, [anthropicApiKey]);

  return (
    <header className="bg-surface border-b border-line sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 shrink-0 rounded-lg bg-premiumSoft flex items-center justify-center text-lg">
            🎞️
          </div>
          <h1 className="text-[15px] sm:text-[17px] font-bold tracking-tight truncate">
            캡컷 반자동 편집
          </h1>
          <span className="ml-1 text-[10px] px-1.5 py-0.5 bg-brand/20 text-brand rounded font-bold">
            BETA
          </span>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <KeyInput
            label="OpenAI"
            placeholder="sk-…"
            value={openaiApiKey}
            onChange={setOpenaiApiKey}
          />
          <KeyInput
            label="Claude"
            placeholder="sk-ant-…"
            value={anthropicApiKey}
            onChange={setAnthropicApiKey}
          />
        </div>
      </div>
    </header>
  );
}

function KeyInput({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative hidden sm:block">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-mute uppercase tracking-wider pointer-events-none">
        {label}
      </span>
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="text-sm pl-16 pr-3 py-2 rounded-xl bg-chip w-52 focus:outline-none focus:bg-white focus:ring-2 focus:ring-brand/30 transition font-mono placeholder:text-mute"
      />
    </div>
  );
}
