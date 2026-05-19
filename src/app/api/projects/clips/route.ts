import { NextResponse } from 'next/server';
import { getClipsByProject } from '@/lib/db';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const projectId = url.searchParams.get('projectId');

  if (!projectId) {
    return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
  }

  const clips = getClipsByProject(projectId);
  return NextResponse.json(clips);
}
