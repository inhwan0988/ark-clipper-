import { NextResponse } from 'next/server';
import pkg from '../../../../package.json';

/**
 * 현재 앱 버전 반환 (UI footer 표시용).
 * package.json의 version을 server에서 읽어 client에 전달.
 */
export async function GET() {
  return NextResponse.json({ version: pkg.version });
}
