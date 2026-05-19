import { NextResponse } from 'next/server';

function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const videoUrl = url.searchParams.get('url');

  if (!videoUrl) {
    return NextResponse.json({ error: 'Missing url' }, { status: 400 });
  }

  const videoId = extractVideoId(videoUrl);
  if (!videoId) {
    return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 });
  }

  try {
    // YouTube oEmbed API - no auth needed
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const res = await fetch(oembedUrl);

    if (!res.ok) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 });
    }

    const data = await res.json();

    return NextResponse.json({
      videoId,
      title: data.title,
      author: data.author_name,
      authorUrl: data.author_url,
      thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
      thumbnailFallback: data.thumbnail_url,
      embedUrl: `https://www.youtube.com/embed/${videoId}`,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch video info' },
      { status: 500 }
    );
  }
}
