import { NextResponse } from 'next/server';
import { getTemplate, updateTemplate, deleteTemplate } from '@/lib/db';

/**
 * Next.js 15+ App Router에서 dynamic route params는 Promise.
 * 다음 패턴 사용: `{ params: Promise<{ id: string }> }`
 */
type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  const t = getTemplate(id);
  if (!t) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }
  return NextResponse.json(t);
}

export async function PUT(req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  const existing = getTemplate(id);
  if (!existing) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }
  let body: { name?: string; settings?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 JSON' }, { status: 400 });
  }

  const fields: { name?: string; settings?: string } = {};
  if (typeof body.name === 'string') {
    const n = body.name.trim();
    if (!n) {
      return NextResponse.json({ error: '이름이 비어있습니다.' }, { status: 400 });
    }
    if (n.length > 100) {
      return NextResponse.json({ error: '이름이 너무 깁니다.' }, { status: 400 });
    }
    fields.name = n;
  }
  if (body.settings !== undefined && body.settings !== null) {
    try {
      const s = typeof body.settings === 'string' ? body.settings : JSON.stringify(body.settings);
      JSON.parse(s); // validate
      fields.settings = s;
    } catch {
      return NextResponse.json({ error: 'settings는 유효한 JSON이어야 합니다.' }, { status: 400 });
    }
  }
  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ error: '업데이트할 필드가 없습니다.' }, { status: 400 });
  }

  updateTemplate(id, fields);
  return NextResponse.json(getTemplate(id));
}

export async function DELETE(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  const existing = getTemplate(id);
  if (!existing) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }
  deleteTemplate(id);
  return NextResponse.json({ ok: true });
}
