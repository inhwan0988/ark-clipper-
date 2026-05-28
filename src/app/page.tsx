'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { UrlInput } from '@/components/url-input';
import { VideoPreview } from '@/components/video-preview';
import { ApiKeySettings, OpenAiKeySettings } from '@/components/api-key-settings';
import { ApiStoragePathSettings, getStoredStoragePath } from '@/components/storage-path-settings';
import { ErrorReportingSettings } from '@/components/error-reporting-settings';
import type { Project } from '@/types';

export default function HomePage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    const res = await fetch('/api/projects');
    if (res.ok) setProjects(await res.json());
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  function handleUrlSubmit(url: string) {
    // Show preview first, don't create project yet
    setPreviewUrl(url);
  }

  async function handleConfirm() {
    if (!previewUrl) return;
    setLoading(true);
    try {
      const workspacePath = getStoredStoragePath();
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ youtube_url: previewUrl, workspace_path: workspacePath }),
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
      {/* Header */}
      <header className="border-b border-[#1a2d4d] px-6 py-4 bg-[#0a1428]">
        <h1 className="text-xl font-bold">ARK Clipper</h1>
        <p className="text-sm text-gray-600">YouTube 롱폼 → 쇼츠 자동 생성</p>
      </header>

      {/* Main */}
      <main className="flex-1 px-6 py-10 bg-[#0a1428]">
        <div className="max-w-7xl mx-auto space-y-10">
          {/* 설정 (API 키 + 저장 폴더) */}
          <div className="flex flex-col items-center gap-3">
            <ApiKeySettings />
            <OpenAiKeySettings />
            <ApiStoragePathSettings />
            <ErrorReportingSettings />
          </div>

          {/* URL Input */}
          <div className="flex flex-col items-center gap-4">
            <h2 className="text-2xl font-semibold text-center">
              YouTube URL을 붙여넣으세요
            </h2>
            <p className="text-gray-600 text-sm text-center">
              AI가 자동으로 후킹 구간을 찾아 쇼츠로 만들어줍니다
            </p>
            {!previewUrl && <UrlInput onSubmit={handleUrlSubmit} loading={false} />}
            {previewUrl && (
              <VideoPreview
                url={previewUrl}
                onConfirm={handleConfirm}
                onCancel={() => setPreviewUrl(null)}
                loading={loading}
              />
            )}
          </div>

          {/* Project List */}
          {projects.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-lg font-semibold">이전 프로젝트</h3>
              <div className="space-y-2">
                {projects.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between p-4 bg-[#0a1428] rounded-lg border border-[#1a2d4d] hover:border-[#243a5c] transition-colors"
                  >
                    <div
                      className="flex-1 min-w-0 cursor-pointer"
                      onClick={() => router.push(`/project/${p.id}`)}
                    >
                      <h4 className="text-white text-sm font-medium truncate">
                        {p.title || p.youtube_url}
                      </h4>
                      <div className="flex items-center gap-3 mt-1">
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          p.status === 'complete' ? 'bg-green-500/20 text-green-400' :
                          p.status === 'error' ? 'bg-red-500/20 text-red-400' :
                          'bg-[#11203d] text-gray-600'
                        }`}>
                          {statusLabels[p.status] || p.status}
                        </span>
                        {p.duration && (
                          <span className="text-xs text-gray-500">
                            {Math.floor(p.duration / 60)}분
                          </span>
                        )}
                        <span className="text-xs text-gray-600">
                          {new Date(p.created_at).toLocaleDateString('ko-KR')}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }}
                      className="ml-3 p-2 text-gray-500 hover:text-red-400 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
