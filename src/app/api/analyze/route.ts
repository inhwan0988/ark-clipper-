import { NextResponse } from 'next/server';
import { analyzeHooks } from '@/lib/claude-analyzer';
import { getProject } from '@/lib/db';

export async function POST(req: Request) {
  const apiKey = req.headers.get('x-api-key') || process.env.ANTHROPIC_API_KEY || '';

  const body = await req.json();
  const { projectId, clipCount } = body as { projectId: string; clipCount?: number };

  const project = getProject(projectId);
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  if (!apiKey.trim()) {
    return NextResponse.json(
      { error: 'Anthropic API 키가 설정되지 않았습니다. 홈 화면에서 API 키를 입력해주세요.' },
      { status: 400 }
    );
  }

  try {
    const hooks = await analyzeHooks(projectId, apiKey, clipCount ?? 6);
    return NextResponse.json(hooks);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Analysis failed' },
      { status: 500 }
    );
  }
}
