import { NextResponse } from 'next/server';
import { downloadVideo } from '@/lib/ytdlp';
import { getProject } from '@/lib/db';

export async function POST(req: Request) {
  const { projectId } = await req.json();

  const project = getProject(projectId);
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  try {
    const result = await downloadVideo(projectId, project.youtube_url);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Download failed' },
      { status: 500 }
    );
  }
}
