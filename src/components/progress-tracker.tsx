'use client';

import { useEffect, useState } from 'react';
import type { ProgressEvent } from '@/types';

const STEPS = [
  { key: 'download', label: '영상 다운로드' },
  { key: 'extract_audio', label: '오디오 추출' },
  { key: 'transcribe', label: '음성 인식' },
  { key: 'analyze', label: 'AI 분석' },
  { key: 'clip', label: '클립 생성' },
] as const;

interface ProgressTrackerProps {
  projectId: string;
  onComplete?: () => void;
  onError?: (msg: string) => void;
}

export function ProgressTracker({ projectId, onComplete, onError }: ProgressTrackerProps) {
  const [stepStates, setStepStates] = useState<Record<string, ProgressEvent>>({});

  useEffect(() => {
    const es = new EventSource(`/api/progress?projectId=${projectId}`);

    es.onmessage = (event) => {
      const data: ProgressEvent = JSON.parse(event.data);
      setStepStates((prev) => ({ ...prev, [data.step]: data }));

      if (data.step === 'clip' && data.status === 'complete') {
        onComplete?.();
      }
      if (data.status === 'error') {
        onError?.(data.detail || data.message);
      }
    };

    return () => es.close();
  }, [projectId, onComplete, onError]);

  return (
    <div className="w-full max-w-2xl space-y-3">
      {STEPS.map(({ key, label }) => {
        const state = stepStates[key];
        const status = state?.status || 'pending';
        const progress = state?.progress || 0;

        return (
          <div key={key} className="flex items-center gap-3">
            <div className="w-5 h-5 flex items-center justify-center">
              {status === 'complete' && (
                <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
              {status === 'running' && (
                <div className="w-4 h-4 border-2 border-[#4988C4] border-t-transparent rounded-full animate-spin" />
              )}
              {status === 'error' && (
                <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
              {status === 'pending' && (
                <div className="w-3 h-3 rounded-full bg-zinc-600" />
              )}
            </div>
            <div className="flex-1">
              <div className="flex justify-between items-center mb-1">
                <span className={`text-sm ${status === 'running' ? 'text-white' : status === 'complete' ? 'text-gray-600' : 'text-gray-500'}`}>
                  {label}
                </span>
                {status === 'running' && (
                  <span className="text-xs text-gray-600">
                    {state?.detail || `${progress}%`}
                  </span>
                )}
              </div>
              {status === 'running' && (
                <div className="h-1.5 bg-[#1a2d4d] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#4988C4] rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              )}
              {status === 'error' && state?.detail && (
                <p className="text-xs text-red-400 mt-1">{state.detail}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
