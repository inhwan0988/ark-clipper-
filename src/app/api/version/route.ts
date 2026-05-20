import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

/**
 * 현재 앱 버전 반환 (UI footer 표시용).
 * package.json import 대신 fs로 읽음 — Next.js webpack의 JSON import가
 * out-of-tree 경로에서 fragile할 수 있어 안전하게 처리.
 * Electron production에서는 cwd가 app.asar.unpacked로 설정되어 OK.
 */
export async function GET() {
  try {
    const pkgPath = path.join(process.cwd(), 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    return NextResponse.json({ version: pkg.version || '' });
  } catch {
    return NextResponse.json({ version: '' });
  }
}
