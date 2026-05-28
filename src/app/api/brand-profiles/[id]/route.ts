/**
 * Phase 4 — Brand Profile 단일 조회/수정/삭제 + 활성화.
 */

import { NextResponse } from 'next/server';
import {
  getBrandProfile,
  updateBrandProfile,
  deleteBrandProfile,
  setActiveBrandProfile,
} from '@/lib/db';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, { params }: RouteParams) {
  const { id } = await params;
  const profile = getBrandProfile(id);
  if (!profile) {
    return NextResponse.json({ error: 'Brand profile not found' }, { status: 404 });
  }
  return NextResponse.json(profile);
}

export async function PUT(req: Request, { params }: RouteParams) {
  const { id } = await params;
  const profile = getBrandProfile(id);
  if (!profile) {
    return NextResponse.json({ error: 'Brand profile not found' }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));

  if (body.activate === true) {
    setActiveBrandProfile(id);
    return NextResponse.json(getBrandProfile(id));
  }

  const allowed = [
    'name',
    'logo_path',
    'primary_color',
    'secondary_color',
    'font_name',
    'cta_text',
    'default_template_id',
    'is_active',
  ] as const;

  const fields: Record<string, unknown> = {};
  for (const k of allowed) {
    if (k in body) fields[k] = body[k];
  }
  updateBrandProfile(id, fields);
  return NextResponse.json(getBrandProfile(id));
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  const { id } = await params;
  deleteBrandProfile(id);
  return NextResponse.json({ ok: true });
}
