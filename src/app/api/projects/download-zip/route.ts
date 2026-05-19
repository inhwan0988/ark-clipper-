import { NextResponse } from 'next/server';
import archiver from 'archiver';
import { getProject, getClipsByProject } from '@/lib/db';
import fs from 'fs';
import path from 'path';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const projectId = url.searchParams.get('projectId');

  if (!projectId) {
    return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
  }

  const project = getProject(projectId);
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const clips = getClipsByProject(projectId).filter(
    (c) => c.status === 'complete' && c.output_path && fs.existsSync(c.output_path)
  );

  if (clips.length === 0) {
    return NextResponse.json({ error: 'No clips available' }, { status: 404 });
  }

  // Sanitize project title for filename
  const safeTitle = (project.title || 'shorts')
    .replace(/[<>:"/\\|?*]/g, '')
    .slice(0, 60) || 'shorts';

  const archive = archiver('zip', { zlib: { level: 6 } });

  // Stream archive to response via ReadableStream
  const stream = new ReadableStream({
    start(controller) {
      archive.on('data', (chunk) => controller.enqueue(chunk));
      archive.on('end', () => controller.close());
      archive.on('error', (err) => controller.error(err));

      clips.forEach((clip, i) => {
        if (!clip.output_path) return;
        const safeName = (clip.title || `clip_${i + 1}`)
          .replace(/[<>:"/\\|?*]/g, '')
          .slice(0, 80);
        const fileName = `${String(i + 1).padStart(2, '0')}_${safeName}.mp4`;
        archive.file(clip.output_path, { name: fileName });
      });

      archive.finalize();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(safeTitle)}_shorts.zip"`,
      'Cache-Control': 'no-cache',
    },
  });
}
