import { NextResponse } from 'next/server';
import { v4 as uuid } from 'uuid';
import {
  createTemplate,
  listTemplates,
} from '@/lib/db';

/** GET /api/templates — 모든 템플릿 list. */
export async function GET() {
  try {
    const items = listTemplates();
    return NextResponse.json(items);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'list 실패' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/templates — 새 템플릿 생성.
 * body: { name: string, settings: object | string }
 *   - settings는 ClipCustomization 전체 JSON. string으로 받아도 되고 object로 받아도 됨.
 */
export async function POST(req: Request) {
  let body: { name?: string; settings?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 JSON' }, { status: 400 });
  }
  const name = (body.name || '').toString().trim();
  if (!name) {
    return NextResponse.json({ error: '템플릿 이름이 필요합니다.' }, { status: 400 });
  }
  if (name.length > 100) {
    return NextResponse.json({ error: '이름이 너무 깁니다 (최대 100자).' }, { status: 400 });
  }
  const settings = body.settings;
  if (settings === undefined || settings === null) {
    return NextResponse.json({ error: 'settings가 필요합니다.' }, { status: 400 });
  }
  // settings는 JSON string으로 저장. object/string 모두 허용.
  let serialized: string;
  try {
    serialized = typeof settings === 'string' ? settings : JSON.stringify(settings);
    JSON.parse(serialized); // validate
  } catch {
    return NextResponse.json({ error: 'settings는 유효한 JSON이어야 합니다.' }, { status: 400 });
  }

  try {
    const created = createTemplate(uuid(), name, serialized);
    return NextResponse.json(created);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'create 실패' },
      { status: 500 },
    );
  }
}
