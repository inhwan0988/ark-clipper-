import { NextResponse } from 'next/server';
import { v4 as uuid } from 'uuid';
import { createProject, listProjects, deleteProject, getProject } from '@/lib/db';
import { projectDir, ensureDir, validateWorkspacePath, PATHS } from '@/lib/paths';
import { checkDiskSpace } from '@/lib/disk-space';
import fs from 'fs';

export async function GET() {
  const projects = listProjects();
  return NextResponse.json(projects);
}

export async function POST(req: Request) {
  const { youtube_url, workspace_path } = await req.json();

  if (!youtube_url || !isValidYoutubeUrl(youtube_url)) {
    return NextResponse.json({ error: '올바른 YouTube URL을 입력해주세요.' }, { status: 400 });
  }

  // 사용자 지정 저장 경로 검증
  let validatedPath: string | null = null;
  try {
    validatedPath = validateWorkspacePath(workspace_path || '');
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Invalid path' }, { status: 400 });
  }

  // 폴더 쓰기 가능 여부 확인 (지정된 경우만) + write 권한 사전 테스트
  if (validatedPath) {
    try {
      ensureDir(validatedPath);
      // write 권한 테스트 (실제로 작은 파일 생성/삭제)
      const testFile = `${validatedPath}/.arc-write-test-${Date.now()}`;
      fs.writeFileSync(testFile, 'ok');
      fs.unlinkSync(testFile);
    } catch (e) {
      return NextResponse.json(
        {
          error:
            `저장 폴더에 쓰기 권한이 없습니다: ${validatedPath}\n` +
            '관리자 권한이 필요한 폴더이거나 다른 프로그램이 잠갔을 수 있어요. ' +
            '다른 폴더(예: D:\\ARK_Shorts)를 선택해주세요.',
        },
        { status: 400 },
      );
      void e;
    }
  }

  // 디스크 공간 사전 체크 (영상 다운로드 + 처리 합산 5GB 이상 권장)
  const checkPath = validatedPath || PATHS.workspace;
  const diskCheck = checkDiskSpace(checkPath, 5000);
  if (!diskCheck.ok) {
    return NextResponse.json({ error: diskCheck.message }, { status: 400 });
  }

  const id = uuid();
  ensureDir(projectDir(id, validatedPath));
  const project = createProject(id, youtube_url, validatedPath);

  return NextResponse.json(project);
}

export async function DELETE(req: Request) {
  const { id } = await req.json();
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  // 프로젝트의 실제 저장 경로로 파일 삭제
  const project = getProject(id);
  const dir = projectDir(id, project?.workspace_path);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  deleteProject(id);
  return NextResponse.json({ ok: true });
}

function isValidYoutubeUrl(url: string): boolean {
  return /^https?:\/\/(www\.)?(youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/)/.test(url);
}
