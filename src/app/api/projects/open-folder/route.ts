import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { getProjectPaths } from '@/lib/db';
import fs from 'fs';

export async function POST(req: Request) {
  const { projectId } = await req.json();
  const pp = getProjectPaths(projectId);
  const dir = fs.existsSync(pp.clips) ? pp.clips : pp.dir;

  // Open folder in Windows Explorer
  exec(`explorer "${dir.replace(/\//g, '\\\\')}"`);
  return NextResponse.json({ ok: true });
}
