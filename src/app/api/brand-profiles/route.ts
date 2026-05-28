/**
 * Phase 4 — Brand Profiles list/create endpoint.
 */

import { NextResponse } from 'next/server';
import { v4 as uuid } from 'uuid';
import { createBrandProfile, listBrandProfiles } from '@/lib/db';

export async function GET() {
  const profiles = listBrandProfiles();
  return NextResponse.json(profiles);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    return NextResponse.json({ error: 'brand profile 이름은 필수입니다.' }, { status: 400 });
  }

  const id = uuid();
  const profile = createBrandProfile({
    id,
    name,
    logo_path: body.logo_path ?? null,
    primary_color: body.primary_color ?? null,
    secondary_color: body.secondary_color ?? null,
    font_name: body.font_name ?? null,
    cta_text: body.cta_text ?? null,
    default_template_id: body.default_template_id ?? null,
    is_active: body.is_active ? 1 : 0,
  });
  return NextResponse.json(profile);
}
