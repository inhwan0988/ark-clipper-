'use client';

import { useState } from 'react';

interface UrlInputProps {
  onSubmit: (url: string) => void;
  loading: boolean;
}

export function UrlInput({ onSubmit, loading }: UrlInputProps) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  const isValid = /^https?:\/\/(www\.)?(youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/)/.test(url);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) {
      setError('URL을 입력해주세요.');
      return;
    }
    if (!isValid) {
      setError('올바른 YouTube URL을 입력해주세요.');
      return;
    }
    setError('');
    onSubmit(url.trim());
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl">
      <div className="flex gap-3">
        <input
          type="text"
          value={url}
          onChange={(e) => { setUrl(e.target.value); setError(''); }}
          placeholder="YouTube 영상 URL을 붙여넣으세요"
          className="flex-1 px-4 py-3 bg-[#0a1428] border border-[#243a5c] rounded-lg text-white placeholder:text-gray-500 focus:outline-none focus:border-[#4988C4] text-sm"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !url.trim()}
          className="px-6 py-3 bg-[#1C4D8D] text-white rounded-lg font-medium hover:bg-[#0F2854] disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm whitespace-nowrap"
        >
          {loading ? '처리 중...' : '쇼츠 만들기'}
        </button>
      </div>
      {error && <p className="mt-2 text-red-400 text-sm">{error}</p>}
    </form>
  );
}
