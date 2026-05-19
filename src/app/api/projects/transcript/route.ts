import { NextResponse } from 'next/server';
import fs from 'fs';
import { getProjectPaths } from '@/lib/db';
import type { Transcript } from '@/types';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const projectId = url.searchParams.get('projectId');

  if (!projectId) {
    return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
  }

  const pp = getProjectPaths(projectId);
  if (!fs.existsSync(pp.transcript)) {
    return NextResponse.json({ segments: [], language: 'ko', duration: 0 });
  }

  try {
    const transcript = JSON.parse(fs.readFileSync(pp.transcript, 'utf-8'));
    return NextResponse.json(transcript);
  } catch {
    return NextResponse.json({ segments: [], language: 'ko', duration: 0 });
  }
}

/**
 * 사용자가 수정한 자막 텍스트 저장 (transcript.json 덮어쓰기).
 * - 시간(start/end)은 유지, text만 변경
 * - 변경 즉시 다음 클립 생성 시 새 자막 반영됨
 */
export async function POST(req: Request) {
  const body = await req.json();
  const { projectId, segments } = body as {
    projectId: string;
    segments: Array<{ start: number; end: number; text: string }>;
  };

  if (!projectId) {
    return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
  }
  if (!Array.isArray(segments)) {
    return NextResponse.json({ error: 'Invalid segments' }, { status: 400 });
  }

  const pp = getProjectPaths(projectId);
  if (!fs.existsSync(pp.transcript)) {
    return NextResponse.json({ error: 'Transcript not found' }, { status: 404 });
  }

  try {
    const existing: Transcript = JSON.parse(fs.readFileSync(pp.transcript, 'utf-8'));

    // 시간 정보는 기존 것 유지, text만 들어온 값으로 업데이트
    const updated = existing.segments.map((seg, i) => {
      const incoming = segments[i];
      if (!incoming) return seg;
      return {
        ...seg,
        text: typeof incoming.text === 'string' ? incoming.text : seg.text,
      };
    });

    const newTranscript: Transcript = { ...existing, segments: updated };
    fs.writeFileSync(pp.transcript, JSON.stringify(newTranscript, null, 2), 'utf-8');
    return NextResponse.json({ ok: true, count: updated.length });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Save failed' },
      { status: 500 }
    );
  }
}
