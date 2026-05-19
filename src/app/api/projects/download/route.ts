import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getClip } from '@/lib/db';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const clipId = url.searchParams.get('clipId');

  if (!clipId) {
    return NextResponse.json({ error: 'Missing clipId' }, { status: 400 });
  }

  const clip = getClip(clipId);
  if (!clip || !clip.output_path) {
    return NextResponse.json({ error: 'Clip not found' }, { status: 404 });
  }

  // clipId로 DB에서 가져온 경로만 사용 (임의 입력 차단)
  const resolved = path.resolve(clip.output_path);
  if (!fs.existsSync(resolved)) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  const stat = fs.statSync(resolved);
  // 3차 방어: 파일이 0B 또는 비정상적으로 작은 경우 (ffmpeg 실패 잔재)
  if (stat.size < 1024) {
    return NextResponse.json(
      {
        error: `클립 파일이 비어있거나 손상됨 (${stat.size} bytes). 좌측에서 재생성 후 다시 다운로드해주세요.`,
      },
      { status: 500 },
    );
  }
  const safeName = (clip.title || `clip_${clipId.slice(0, 8)}`)
    .replace(/[<>:"/\\|?*]/g, '')
    .slice(0, 80);
  const fileName = `${safeName}.mp4`;

  const stream = fs.createReadStream(resolved);
  const webStream = new ReadableStream({
    start(controller) {
      stream.on('data', (chunk) => controller.enqueue(chunk));
      stream.on('end', () => controller.close());
      stream.on('error', (err) => controller.error(err));
    },
  });

  return new Response(webStream, {
    headers: {
      'Content-Length': stat.size.toString(),
      'Content-Type': 'video/mp4',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
    },
  });
}
