import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getProject, getProjectPaths } from '@/lib/db';
import { ensureDir } from '@/lib/paths';

/**
 * 사용자가 업로드한 배경 이미지/영상을 프로젝트 폴더에 저장.
 *
 * - multipart/form-data:
 *     - projectId: string (form field)
 *     - file: File (image: jpg/png/webp / video: mp4/mov/webm/mkv)
 *
 * - 저장 위치: `<projectDir>/background.<ext>` (덮어쓰기)
 * - 최대 100MB
 * - 응답: { path: string, kind: 'image' | 'video' }
 */

const MAX_BYTES = 100 * 1024 * 1024; // 100MB
const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp'];
const VIDEO_EXTS = ['.mp4', '.mov', '.webm', '.mkv'];
const IMAGE_MIME_PREFIXES = ['image/'];
const VIDEO_MIME_PREFIXES = ['video/'];

function sanitizeExt(ext: string): string {
  const e = ext.toLowerCase().trim();
  if (!/^\.[a-z0-9]{1,8}$/.test(e)) return '';
  return e;
}

function detectKind(filename: string, mime: string): 'image' | 'video' | null {
  const ext = sanitizeExt(path.extname(filename));
  if (IMAGE_EXTS.includes(ext)) return 'image';
  if (VIDEO_EXTS.includes(ext)) return 'video';
  // 확장자가 없거나 비표준일 때 MIME으로 fallback.
  if (IMAGE_MIME_PREFIXES.some((p) => mime.startsWith(p))) return 'image';
  if (VIDEO_MIME_PREFIXES.some((p) => mime.startsWith(p))) return 'video';
  return null;
}

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch (err) {
    return NextResponse.json(
      { error: 'multipart/form-data 파싱 실패. file과 projectId가 모두 필요합니다.' },
      { status: 400 },
    );
    void err;
  }

  const projectId = (form.get('projectId') || '').toString().trim();
  if (!projectId) {
    return NextResponse.json({ error: 'projectId가 필요합니다.' }, { status: 400 });
  }
  const project = getProject(projectId);
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const fileEntry = form.get('file');
  if (!fileEntry || typeof fileEntry === 'string') {
    return NextResponse.json({ error: 'file 필드가 누락되었습니다.' }, { status: 400 });
  }
  const file = fileEntry as File;
  const size = file.size ?? 0;
  if (size <= 0) {
    return NextResponse.json({ error: '빈 파일입니다.' }, { status: 400 });
  }
  if (size > MAX_BYTES) {
    return NextResponse.json(
      {
        error: `파일이 너무 큽니다 (${Math.round(size / 1024 / 1024)}MB). 최대 100MB까지 가능해요.`,
      },
      { status: 400 },
    );
  }

  const origName = (file.name || '').trim();
  const mime = (file.type || '').toLowerCase();
  const kind = detectKind(origName, mime);
  if (!kind) {
    return NextResponse.json(
      { error: '지원하지 않는 파일 형식입니다. 이미지(jpg/png/webp) 또는 영상(mp4/mov/webm/mkv)만 가능해요.' },
      { status: 400 },
    );
  }

  // 확장자 결정 — origName이 한글이어도 ext만 쓰므로 안전. 미존재 시 MIME 기반 기본값.
  let ext = sanitizeExt(path.extname(origName));
  if (!ext) {
    ext =
      kind === 'image'
        ? mime.includes('png')
          ? '.png'
          : mime.includes('webp')
            ? '.webp'
            : '.jpg'
        : mime.includes('webm')
          ? '.webm'
          : mime.includes('quicktime') || mime.includes('mov')
            ? '.mov'
            : '.mp4';
  }

  const pp = getProjectPaths(projectId);
  ensureDir(pp.dir);

  // 기존 background.* 파일 정리 (사용자가 다른 형식으로 재업로드할 때 잔존 방지).
  try {
    for (const f of fs.readdirSync(pp.dir)) {
      if (f.startsWith('background.')) {
        try {
          fs.unlinkSync(path.join(pp.dir, f));
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    /* ignore — dir이 비어있을 수도 */
  }

  const outPath = path.join(pp.dir, `background${ext}`);

  // ArrayBuffer로 받아서 fs로 저장 (formData File은 Web Streams API 호환).
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(outPath, buf);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? `파일 저장 실패: ${err.message}`
            : '파일 저장 중 알 수 없는 오류가 발생했습니다.',
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ path: outPath, kind });
}
