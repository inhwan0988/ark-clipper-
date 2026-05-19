'use client';

import { useEffect, useState } from 'react';

interface VideoInfo {
  videoId: string;
  title: string;
  author: string;
  authorUrl: string;
  thumbnailUrl: string;
  thumbnailFallback: string;
  embedUrl: string;
}

interface VideoPreviewProps {
  url: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}

export function VideoPreview({ url, onConfirm, onCancel, loading }: VideoPreviewProps) {
  const [info, setInfo] = useState<VideoInfo | null>(null);
  const [error, setError] = useState('');
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setFetching(true);
    setError('');

    fetch(`/api/youtube-info?url=${encodeURIComponent(url)}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) setError(data.error);
        else setInfo(data);
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setFetching(false));

    return () => { cancelled = true; };
  }, [url]);

  if (fetching) {
    return (
      <div className="w-full max-w-2xl bg-[#0a1428] border border-[#1a2d4d] rounded-lg p-8 flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-[#4988C4] border-t-transparent rounded-full animate-spin" />
        <span className="ml-3 text-gray-600 text-sm">영상 정보 가져오는 중...</span>
      </div>
    );
  }

  if (error || !info) {
    return (
      <div className="w-full max-w-2xl bg-red-500/10 border border-red-500/20 rounded-lg p-4">
        <p className="text-red-400 text-sm">영상 정보를 가져올 수 없습니다: {error}</p>
        <button
          onClick={onCancel}
          className="mt-2 px-3 py-1.5 bg-[#243a5c] text-white rounded text-sm hover:bg-zinc-600"
        >
          다른 URL 입력
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl bg-[#0a1428] rounded-xl border border-[#1a2d4d] overflow-hidden">
      {/* Embed player */}
      <div className="aspect-video bg-[#0a1428]">
        <iframe
          src={info.embedUrl}
          title={info.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="w-full h-full"
        />
      </div>

      {/* Info */}
      <div className="p-4 space-y-3">
        <div>
          <h3 className="text-white font-medium text-base leading-snug">{info.title}</h3>
          <a
            href={info.authorUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-600 text-sm mt-1 hover:text-white inline-block"
          >
            {info.author}
          </a>
        </div>

        <p className="text-gray-500 text-xs">
          이 영상이 맞나요? 분석을 시작하면 다운로드 후 자동으로 진행됩니다.
        </p>

        <div className="flex gap-2 pt-2">
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 px-4 py-2.5 bg-[#1C4D8D] text-white rounded-lg font-medium hover:bg-[#0F2854] disabled:opacity-50 transition-colors text-sm"
          >
            {loading ? '시작 중...' : '맞아요, 분석 시작'}
          </button>
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2.5 bg-[#11203d] border border-[#243a5c] text-gray-300 rounded-lg hover:bg-[#1a2d4d] disabled:opacity-50 transition-colors text-sm"
          >
            다른 영상
          </button>
        </div>
      </div>
    </div>
  );
}
