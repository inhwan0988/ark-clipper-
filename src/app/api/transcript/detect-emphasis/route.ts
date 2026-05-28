import { NextResponse } from 'next/server';
import fs from 'fs';
import { detectEmphasisKeywords } from '@/lib/claude-analyzer';
import { getProject, getProjectPaths } from '@/lib/db';
import type { Transcript } from '@/types';

/**
 * Phase 2 / 작업 1 — 강조 단어 자동 추출.
 *
 * POST body: { projectId: string; anthropicApiKey?: string }
 * - x-api-key 헤더 또는 body.anthropicApiKey 둘 다 허용.
 *
 * transcript.json을 읽어 각 segment에 keywords[] 필드를 채워 다시 저장.
 * 응답: { updated: number; segments: number }
 */
export async function POST(req: Request) {
  const headerKey = req.headers.get('x-api-key') || '';
  const body = (await req.json().catch(() => ({}))) as {
    projectId?: string;
    anthropicApiKey?: string;
  };
  const apiKey = (headerKey || body.anthropicApiKey || process.env.ANTHROPIC_API_KEY || '').trim();
  const { projectId } = body;

  if (!projectId) {
    return NextResponse.json({ error: 'projectId가 필요합니다.' }, { status: 400 });
  }
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Anthropic API 키가 설정되지 않았습니다.' },
      { status: 400 },
    );
  }

  const project = getProject(projectId);
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const pp = getProjectPaths(projectId);
  if (!fs.existsSync(pp.transcript)) {
    return NextResponse.json(
      { error: 'transcript.json이 없어요. 전사를 먼저 완료해주세요.' },
      { status: 400 },
    );
  }

  try {
    const transcript: Transcript = JSON.parse(fs.readFileSync(pp.transcript, 'utf-8'));
    const results = await detectEmphasisKeywords(transcript, apiKey);

    const map = new Map<number, string[]>();
    for (const r of results) map.set(r.segmentId, r.keywords);

    let updated = 0;
    transcript.segments = transcript.segments.map((seg, i) => {
      const kws = map.get(i);
      if (kws && kws.length > 0) {
        updated += 1;
        return { ...seg, keywords: kws };
      }
      return seg;
    });

    fs.writeFileSync(pp.transcript, JSON.stringify(transcript, null, 2), 'utf-8');
    return NextResponse.json({
      updated,
      segments: transcript.segments.length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '강조 단어 추출 실패' },
      { status: 500 },
    );
  }
}
