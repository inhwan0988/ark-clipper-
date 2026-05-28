import Database from 'better-sqlite3';
import { PATHS, ensureDir, projectPaths as basePaths } from './paths';
import type { Project, Clip } from '@/types';

/**
 * 프로젝트 ID로 paths를 가져옴. workspace_path가 설정돼 있으면 그 경로 사용.
 */
export function getProjectPaths(projectId: string) {
  const project = getProject(projectId);
  return basePaths(projectId, project?.workspace_path);
}

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!_db) {
    ensureDir(PATHS.data);
    _db = new Database(PATHS.db);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    // 동시 작업 시 DB lock 대기 (10초). race condition fail 방지.
    _db.pragma('busy_timeout = 10000');
    migrate(_db);
  }
  return _db;
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id             TEXT PRIMARY KEY,
      youtube_url    TEXT NOT NULL,
      title          TEXT,
      duration       REAL,
      status         TEXT DEFAULT 'created',
      error_msg      TEXT,
      workspace_path TEXT,
      created_at     TEXT DEFAULT (datetime('now')),
      updated_at     TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS clips (
      id          TEXT PRIMARY KEY,
      project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      start_time  REAL NOT NULL,
      end_time    REAL NOT NULL,
      title       TEXT,
      reason      TEXT,
      confidence  REAL,
      status      TEXT DEFAULT 'pending',
      output_path TEXT,
      is_manual   INTEGER DEFAULT 0,
      created_at  TEXT DEFAULT (datetime('now'))
    );

    -- Phase 4 — 채널 brand template (로고/색/폰트/CTA를 채널 단위로 관리)
    -- Phase 1의 templates 테이블과 별개. default_template_id로 약하게 link.
    CREATE TABLE IF NOT EXISTS brand_profiles (
      id                  TEXT PRIMARY KEY,
      name                TEXT NOT NULL,
      logo_path           TEXT,
      primary_color       TEXT,
      secondary_color     TEXT,
      font_name           TEXT,
      cta_text            TEXT,
      default_template_id TEXT,
      is_active           INTEGER DEFAULT 0,
      created_at          TEXT DEFAULT (datetime('now')),
      updated_at          TEXT DEFAULT (datetime('now'))
    );
  `);

  // 기존 DB에 workspace_path 컬럼 없으면 추가 (안전한 마이그레이션)
  try {
    const cols = db.prepare("PRAGMA table_info(projects)").all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === 'workspace_path')) {
      db.exec(`ALTER TABLE projects ADD COLUMN workspace_path TEXT`);
    }
  } catch { /* ignore */ }
}

// Projects
export function createProject(id: string, youtubeUrl: string, workspacePath?: string | null): Project {
  const db = getDb();
  db.prepare(
    'INSERT INTO projects (id, youtube_url, workspace_path) VALUES (?, ?, ?)'
  ).run(id, youtubeUrl, workspacePath ?? null);
  return getProject(id)!;
}

export function getProject(id: string): Project | null {
  const db = getDb();
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Project | null;
}

export function listProjects(): Project[] {
  const db = getDb();
  return db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all() as Project[];
}

export function updateProject(id: string, fields: Partial<Pick<Project, 'title' | 'duration' | 'status' | 'error_msg'>>): void {
  const db = getDb();
  const sets: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(fields)) {
    sets.push(`${key} = ?`);
    values.push(value);
  }
  sets.push("updated_at = datetime('now')");
  values.push(id);

  db.prepare(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`).run(...values);
}

export function deleteProject(id: string): void {
  const db = getDb();
  db.prepare('DELETE FROM projects WHERE id = ?').run(id);
}

// Clips
export function createClip(clip: Omit<Clip, 'created_at' | 'status' | 'output_path'>): Clip {
  const db = getDb();
  db.prepare(
    `INSERT INTO clips (id, project_id, start_time, end_time, title, reason, confidence, is_manual)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(clip.id, clip.project_id, clip.start_time, clip.end_time, clip.title, clip.reason, clip.confidence, clip.is_manual);
  return getClip(clip.id)!;
}

export function getClip(id: string): Clip | null {
  const db = getDb();
  return db.prepare('SELECT * FROM clips WHERE id = ?').get(id) as Clip | null;
}

export function getClipsByProject(projectId: string): Clip[] {
  const db = getDb();
  return db.prepare('SELECT * FROM clips WHERE project_id = ? ORDER BY start_time').all(projectId) as Clip[];
}

export function updateClip(id: string, fields: Partial<Pick<Clip, 'status' | 'output_path' | 'start_time' | 'end_time' | 'title'>>): void {
  const db = getDb();
  const sets: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(fields)) {
    sets.push(`${key} = ?`);
    values.push(value);
  }
  values.push(id);

  db.prepare(`UPDATE clips SET ${sets.join(', ')} WHERE id = ?`).run(...values);
}

export function deleteClipsByProject(projectId: string): void {
  const db = getDb();
  db.prepare('DELETE FROM clips WHERE project_id = ?').run(projectId);
}

// ============================================================================
// Phase 4 — Brand Profiles
// ============================================================================

export interface BrandProfile {
  id: string;
  name: string;
  logo_path: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  font_name: string | null;
  cta_text: string | null;
  default_template_id: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export type BrandProfileInput = Omit<BrandProfile, 'created_at' | 'updated_at' | 'is_active'> & {
  is_active?: number;
};

export function createBrandProfile(input: BrandProfileInput): BrandProfile {
  const db = getDb();
  db.prepare(
    `INSERT INTO brand_profiles
     (id, name, logo_path, primary_color, secondary_color, font_name, cta_text, default_template_id, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    input.id,
    input.name,
    input.logo_path ?? null,
    input.primary_color ?? null,
    input.secondary_color ?? null,
    input.font_name ?? null,
    input.cta_text ?? null,
    input.default_template_id ?? null,
    input.is_active ?? 0,
  );
  return getBrandProfile(input.id)!;
}

export function getBrandProfile(id: string): BrandProfile | null {
  const db = getDb();
  return db.prepare('SELECT * FROM brand_profiles WHERE id = ?').get(id) as BrandProfile | null;
}

export function listBrandProfiles(): BrandProfile[] {
  const db = getDb();
  return db
    .prepare('SELECT * FROM brand_profiles ORDER BY is_active DESC, created_at DESC')
    .all() as BrandProfile[];
}

export function getActiveBrandProfile(): BrandProfile | null {
  const db = getDb();
  return db
    .prepare('SELECT * FROM brand_profiles WHERE is_active = 1 LIMIT 1')
    .get() as BrandProfile | null;
}

export function updateBrandProfile(
  id: string,
  fields: Partial<Omit<BrandProfile, 'id' | 'created_at' | 'updated_at'>>,
): void {
  const db = getDb();
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [k, v] of Object.entries(fields)) {
    sets.push(`${k} = ?`);
    values.push(v);
  }
  if (sets.length === 0) return;
  sets.push("updated_at = datetime('now')");
  values.push(id);
  db.prepare(`UPDATE brand_profiles SET ${sets.join(', ')} WHERE id = ?`).run(...values);
}

export function setActiveBrandProfile(id: string): void {
  const db = getDb();
  const tx = db.transaction((targetId: string) => {
    db.prepare('UPDATE brand_profiles SET is_active = 0').run();
    db.prepare(
      "UPDATE brand_profiles SET is_active = 1, updated_at = datetime('now') WHERE id = ?",
    ).run(targetId);
  });
  tx(id);
}

export function deleteBrandProfile(id: string): void {
  const db = getDb();
  db.prepare('DELETE FROM brand_profiles WHERE id = ?').run(id);
}
