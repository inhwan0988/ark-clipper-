import { NextResponse } from 'next/server';
import { extractAudio } from '@/lib/ffmpeg-ops';
import { transcribe } from '@/lib/whisper';
import { getProject } from '@/lib/db';

export async function POST(req: Request) {
  const { projectId, openaiApiKey } = await req.json();

  const project = getProject(projectId);
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  if (!openaiApiKey || typeof openaiApiKey !== 'string' || !openaiApiKey.trim()) {
    return NextResponse.json(
      { error: 'OpenAI API 키가 필요합니다. 우상단 설정에서 입력해주세요.' },
      { status: 400 }
    );
  }

  try {
    await extractAudio(projectId);
    const transcript = await transcribe(projectId, openaiApiKey);
    return NextResponse.json({ segments: transcript.segments.length, duration: transcript.duration });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Transcription failed' },
      { status: 500 }
    );
  }
}
