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
