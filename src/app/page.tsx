'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ApiKeySettings,
  OpenAiKeySettings,
  AssemblyAiKeySettings,
} from '@/components/api-key-settings';
import { BrandProfileManager } from '@/components/brand-profile-manager';
import {
  ApiStoragePathSettings,
  getStoredStoragePath,
} from '@/components/storage-path-settings';
import { ErrorReportingSettings } from '@/components/error-reporting-settings';
import { VideoPreview } from '@/components/video-preview';
import type { Project } from '@/types';

/** YouTube URL에서 video ID 추출. 실패 시 null. */
function extractYoutubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  // youtu.be/<id>
  const short = url.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/);
  if (short) return short[1];
  // youtube.com/watch?v=<id>
  const watch = url.match(/[?&]v=([A-Za-z0-9_-]{6,})/);
  if (watch) return watch[1];
  // youtube.com/shorts/<id>
  const shorts = url.match(/shorts\/([A-Za-z0-9_-]{6,})/);
  if (shorts) return shorts[1];
  return null;
}

/** 영상 ID → YouTube hqdefault 썸네일 URL. */
function youtubeThumb(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

export default function HomePage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [urlError, setUrlError] = useState('');
  const [showSettings, setShowSettings] = useState(false);

  const fetchProjects = useCallback(async () => {
    const res = await fetch('/api/projects');
    if (res.ok) setProjects(await res.json());
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const isValidUrl =
    /^https?:\/\/(www\.)?(youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/)/.test(url);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) {
      setUrlError('YouTube URL을 붙여넣어주세요.');
      return;
    }
    if (!isValidUrl) {
      setUrlError('올바른 YouTube URL이 아닙니다.');
      return;
    }
    setUrlError('');
    setPreviewUrl(url.trim());
  }

  async function handleConfirm() {
    if (!previewUrl) return;
    setLoading(true);
    try {
      const workspacePath = getStoredStoragePath();
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          youtube_url: previewUrl,
          workspace_path: workspacePath,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || '프로젝트 생성 실패');
        return;
      }
      const project = await res.json();
      router.push(`/project/${project.id}`);
    } catch {
      alert('서버 연결 실패');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('이 프로젝트를 삭제할까요?')) return;
    await fetch('/api/projects', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    fetchProjects();
  }

  const statusLabels: Record<string, string> = {
    created: '생성됨',
    downloading: '다운로드 중',
    downloaded: '다운로드 완료',
    extracting_audio: '오디오 추출 중',
    transcribing: '음성 인식 중',
    transcribed: '전사 완료',
    analyzing: 'AI 분석 중',
    analyzed: '분석 완료',
    clipping: '클립 생성 중',
    complete: '완료',
    error: '오류',
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0a1428]">
      {/* Header — 우상단 설정 톱니바퀴 */}
      <header className="border-b border-[#1a2d4d] px-6 py-4 bg-[#0a1428] flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">ARK Clipper</h1>
          <p className="text-xs text-gray-500">YouTube 롱폼 → 쇼츠 자동 생성</p>
        </div>
        <button
          onClick={() => setShowSettings(true)}
          className="p-2 text-gray-400 hover:text-white transition-colors"
          title="설정"
          aria-label="설정"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        </button>
      </header>

      {/* Main */}
      <main className="flex-1 px-6 py-12 bg-[#0a1428]">
        <div className="max-w-xl mx-auto space-y-10">
          {/* 1) API 키 (큰 컴포넌트 그대로 — 사용자가 한눈에 볼 수 있게) */}
          {!previewUrl && (
            <section className="space-y-3">
              <h2 className="text-xs font-bold tracking-widest uppercase text-gray-500">
                API 키
              </h2>
              <div className="space-y-2">
                <ApiKeySettings />
                <OpenAiKeySettings />
              </div>
              <p className="text-[11px] text-gray-600">
                필수: Anthropic (제목/후킹 분석) + OpenAI (Whisper 음성 인식)
              </p>
            </section>
          )}

          {/* 2) YouTube URL 입력 — 큰 텍스트 + 시작 버튼 */}
          {!previewUrl ? (
            <section className="space-y-4">
              <h2 className="text-3xl font-bold text-white leading-tight">
                YouTube 영상 링크
              </h2>
              <form onSubmit={handleSubmit} className="space-y-3">
                <input
                  type="text"
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    setUrlError('');
                  }}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="w-full px-5 py-4 bg-[#0a1428] border border-[#243a5c] rounded-lg text-white text-lg placeholder:text-gray-600 focus:outline-none focus:border-[#4988C4]"
                />
                <button
                  type="submit"
                  disabled={!url.trim()}
                  className="w-full px-6 py-4 bg-[#1C4D8D] text-white rounded-lg text-lg font-bold hover:bg-[#0F2854] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  시작
                </button>
                {urlError && (
                  <p className="text-sm text-red-400">{urlError}</p>
                )}
              </form>
            </section>
          ) : (
            <section className="flex flex-col items-center gap-4">
              <VideoPreview
                url={previewUrl}
                onConfirm={handleConfirm}
                onCancel={() => setPreviewUrl(null)}
                loading={loading}
              />
            </section>
          )}

          {/* 3) 이전 프로젝트 카드 — 썸네일 + 정보 */}
          {!previewUrl && projects.length > 0 && (
            <section className="space-y-3 pt-4">
              <h3 className="text-xs font-bold tracking-widest uppercase text-gray-500">
                이전 프로젝트
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {projects.map((p) => {
                  const videoId = extractYoutubeId(p.youtube_url);
                  const thumb = videoId ? youtubeThumb(videoId) : null;
                  return (
                    <div
                      key={p.id}
                      className="group relative bg-[#11203d] rounded-lg border border-[#1a2d4d] hover:border-[#4988C4] overflow-hidden transition-colors cursor-pointer"
                      onClick={() => router.push(`/project/${p.id}`)}
                    >
                      {/* 썸네일 */}
                      <div className="aspect-video bg-[#0a1428] overflow-hidden relative">
                        {thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={thumb}
                            alt={p.title || 'thumbnail'}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display =
                                'none';
                            }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-700 text-xs">
                            썸네일 없음
                          </div>
                        )}
                        <span
                          className={`absolute top-2 left-2 text-[10px] px-2 py-0.5 rounded font-medium ${
                            p.status === 'complete'
                              ? 'bg-green-500/90 text-white'
                              : p.status === 'error'
                                ? 'bg-red-500/90 text-white'
                                : 'bg-black/70 text-gray-200'
                          }`}
                        >
                          {statusLabels[p.status] || p.status}
                        </span>
                      </div>
                      {/* 정보 */}
                      <div className="p-3 space-y-1">
                        <h4 className="text-white text-sm font-medium line-clamp-2 leading-snug">
                          {p.title || p.youtube_url}
                        </h4>
                        <div className="flex items-center justify-between text-[11px] text-gray-500">
                          <span>
                            {new Date(p.created_at).toLocaleDateString('ko-KR')}
                          </span>
                          {p.duration ? (
                            <span>{Math.floor(p.duration / 60)}분</span>
                          ) : null}
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(p.id);
                        }}
                        className="absolute top-2 right-2 p-1.5 rounded bg-black/60 text-gray-300 opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all"
                        title="삭제"
                        aria-label="삭제"
                      >
                        <svg
                          className="w-3.5 h-3.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </main>

      {/* 설정 모달 — 부가 설정 (저장 경로, AssemblyAI, 브랜드, 오류 리포트) */}
      {showSettings && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-6"
          onClick={() => setShowSettings(false)}
        >
          <div
            className="bg-[#0a1428] border border-[#243a5c] rounded-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-[#1a2d4d] flex items-center justify-between sticky top-0 bg-[#0a1428]">
              <h2 className="text-lg font-bold text-white">설정</h2>
              <button
                onClick={() => setShowSettings(false)}
                className="p-1 text-gray-500 hover:text-white"
                aria-label="닫기"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            <div className="px-6 py-5 space-y-5">
              <div>
                <div className="text-[11px] font-bold tracking-widest uppercase text-gray-500 mb-2">
                  API 키
                </div>
                <div className="space-y-2">
                  <ApiKeySettings />
                  <OpenAiKeySettings />
                  <AssemblyAiKeySettings />
                </div>
              </div>
              <div>
                <div className="text-[11px] font-bold tracking-widest uppercase text-gray-500 mb-2">
                  저장 경로
                </div>
                <ApiStoragePathSettings />
              </div>
              <div>
                <div className="text-[11px] font-bold tracking-widest uppercase text-gray-500 mb-2">
                  브랜드 프로필
                </div>
                <BrandProfileManager />
              </div>
              <div>
                <div className="text-[11px] font-bold tracking-widest uppercase text-gray-500 mb-2">
                  오류 리포트
                </div>
                <ErrorReportingSettings />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
