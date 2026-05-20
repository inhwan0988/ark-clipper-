import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';

/**
 * 사용자의 next-server.log 파일을 OS 기본 텍스트 에디터로 연다.
 * Electron main.js가 ARC_LOG_FILE env로 절대경로 전달.
 * 사용자 안내: "에러 발생 시 → 로그 파일 첨부해 문의" 흐름의 핵심 UX.
 */
export async function POST() {
  const logFile = process.env.ARC_LOG_FILE;
  if (!logFile) {
    return NextResponse.json(
      { error: '로그 파일 경로를 찾을 수 없습니다 (dev 환경일 수 있어요).' },
      { status: 404 },
    );
  }
  if (!fs.existsSync(logFile)) {
    return NextResponse.json(
      { error: `로그 파일이 아직 생성되지 않았습니다: ${logFile}` },
      { status: 404 },
    );
  }
  // OS별 기본 텍스트 에디터로 열기
  const cmd =
    process.platform === 'win32'
      ? `start "" "${logFile}"`
      : process.platform === 'darwin'
        ? `open "${logFile}"`
        : `xdg-open "${logFile}"`;
  try {
    exec(cmd, (err) => {
      if (err) console.error('[open-log] exec error:', err);
    });
    return NextResponse.json({ ok: true, path: logFile });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

/**
 * 로그 파일 경로만 반환 (UI 표시용)
 */
export async function GET() {
  const logFile = process.env.ARC_LOG_FILE;
  // 폴더 경로도 같이 제공 (사용자가 파일을 못 찾으면 폴더로 navigate)
  const dir = logFile ? path.dirname(logFile) : null;
  return NextResponse.json({
    logFile: logFile || null,
    dir,
    exists: logFile ? fs.existsSync(logFile) : false,
  });
}
