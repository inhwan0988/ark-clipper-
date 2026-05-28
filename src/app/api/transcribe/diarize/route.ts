/**
 * Phase 4 — Speaker Diarization endpoint
 *
 * Whisper로 이미 transcribed된 프로젝트에 대해, AssemblyAI를 호출해
 * 화자 라벨이 부착된 transcript로 덮어씀.
 *
 * 요청: { projectId, assemblyApiKey, language? }
 * 응답: { segments, speakers }
 */

import { NextResponse } from 'next/server';
import fs from 'fs';
import { extractAudio } from '@/lib/ffmpeg-ops';
import { transcribeWithDiarization, isValidAssemblyKey } from '@/lib/assemblyai';
import { getProject, getProjectPaths } from '@/lib/db';
import { emitProgress } from '@/lib/progress-bus';
import type { Transcript } from '@/types';

export async function POST(req: Request) {
  const { projectId, assemblyApiKey, language } = await req.json();

  const project = getProject(projectId);
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  if (!assemblyApiKey || typeof assemblyApiKey !== 'string' || !assemblyApiKey.trim()) {
    return NextResponse.json(
      { error: 'AssemblyAI API 키가 필요합니다. 상단 설정에서 입력 후 다시 시도해주세요.' },
      { status: 400 },
    );
  }
  if (!isValidAssemblyKey(assemblyApiKey)) {
    return NextResponse.json(
      { error: 'AssemblyAI API 키 형식이 올바르지 않습니다 (16진수 32+ 자리).' },
      { status: 400 },
    );
  }

  const pp = getProjectPaths(projectId);

  try {
    if (!fs.existsSync(pp.audio)) {
      await extractAudio(projectId);
    }

    emitProgress({
      projectId,
      step: 'transcribe',
      status: 'running',
      progress: 5,
      message: '화자 구분 분석 시작 (AssemblyAI)',
    });

    const transcript: Transcript = await transcribeWithDiarization(
      pp.audio,
      assemblyApiKey.trim(),
      language || 'ko',
      (msg) => {
        emitProgress({
          projectId,
          step: 'transcribe',
          status: 'running',
          progress: 50,
          message: msg,
        });
      },
    );

    fs.writeFileSync(pp.transcript, JSON.stringify(transcript, null, 2), 'utf-8');

    const speakers = Array.from(
      new Set(transcript.segments.map((s) => s.speaker).filter(Boolean) as string[]),
    );

    emitProgress({
      projectId,
      step: 'transcribe',
      status: 'complete',
      progress: 100,
      message: `화자 ${speakers.length}명 구분 완료 (${transcript.segments.length}개 구간)`,
    });

    return NextResponse.json({
      segments: transcript.segments.length,
      speakers,
      duration: transcript.duration,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '화자 구분 실패';
    emitProgress({
      projectId,
      step: 'transcribe',
      status: 'error',
      progress: 0,
      message: msg,
    });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
