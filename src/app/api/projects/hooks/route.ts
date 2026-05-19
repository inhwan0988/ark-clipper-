import { NextResponse } from 'next/server';
import { getProjectPaths } from '@/lib/db';
import fs from 'fs';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const projectId = url.searchParams.get('projectId');

  if (!projectId) {
    return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
  }

  const pp = getProjectPaths(projectId);
  if (!fs.existsSync(pp.hooks)) {
    return NextResponse.json([]);
  }

  const hooks = JSON.parse(fs.readFileSync(pp.hooks, 'utf-8'));
  return NextResponse.json(hooks);
}
