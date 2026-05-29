import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getProjectPaths } from '@/lib/db';

/**
 * 프로젝트의 커스텀 배경 파일(<projectDir>/background.*)을 브라우저에 서빙.
 * 편집기 미리보기에서 custom_background 레이아웃의 배경을 보여주는 데 사용.
 * 업로드 시 덮어쓰므로 Cache-Control: no-store로 항상 최신본 반환.
 */
const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const projectId = url.searchParams.get('projectId');
  if (!projectId) {
    return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
  }

  const pp = getProjectPaths(projectId);
  let bgFile: string | null = null;
  try {
    const found = fs
      .readdirSync(pp.dir)
      .find((n) => n.startsWith('background.'));
    if (found) bgFile = path.join(pp.dir, found);
  } catch {
    /* dir 없음 등 — 무시 */
  }

  if (!bgFile || !fs.existsSync(bgFile)) {
    return NextResponse.json({ error: 'Background not found' }, { status: 404 });
  }

  const ext = path.extname(bgFile).toLowerCase();
  const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';
  const stat = fs.statSync(bgFile);
  const nodeStream = fs.createReadStream(bgFile);
  const webStream = new ReadableStream({
    start(controller) {
      nodeStream.on('data', (chunk) => controller.enqueue(chunk));
      nodeStream.on('end', () => controller.close());
      nodeStream.on('error', (err) => controller.error(err));
    },
  });

  return new Response(webStream, {
    headers: {
      'Content-Type': contentType,
      'Content-Length': stat.size.toString(),
      'Cache-Control': 'no-store',
    },
  });
}
