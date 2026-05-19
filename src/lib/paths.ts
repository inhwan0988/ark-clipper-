import path from 'path';
import fs from 'fs';
import os from 'os';

const ROOT = path.resolve(process.cwd());

// 휴대용 번들에서는 ARC_PORTABLE_ROOT가 지정되어 있음 (start.bat가 설정)
// 그 외에는 process.cwd() = 프로젝트 루트
const PORTABLE_ROOT = process.env.ARC_PORTABLE_ROOT;

const BASE = PORTABLE_ROOT || ROOT;

const IS_WINDOWS = process.platform === 'win32';

/**
 * npm 패키지에 번들된 ffmpeg / yt-dlp 바이너리 경로를 동적으로 찾는다.
 * - @ffmpeg-installer/ffmpeg: ffmpeg 바이너리 자동 번들 (OS별)
 * - youtube-dl-exec: yt-dlp 바이너리 자동 번들 (OS별)
 *
 * Electron 빌드 후에도 동작하도록 require.resolve 패턴 사용.
 */
// webpack의 동적 require 분석을 회피하기 위해 node_modules 경로 직접 구성
const NODE_MODULES = path.join(ROOT, 'node_modules');

function getBundledFfmpeg(): string | null {
  // @ffmpeg-installer는 OS+arch별 서브패키지에 바이너리 위치
  // 예: node_modules/@ffmpeg-installer/darwin-arm64/ffmpeg
  const archMap: Record<string, string> = {
    'darwin-arm64': 'darwin-arm64',
    'darwin-x64': 'darwin-x64',
    'linux-x64': 'linux-x64',
    'linux-arm64': 'linux-arm64',
    'win32-x64': 'win32-x64',
    'win32-ia32': 'win32-ia32',
  };
  const key = `${process.platform}-${process.arch}`;
  const subPkg = archMap[key];
  if (!subPkg) return null;
  const binName = IS_WINDOWS ? 'ffmpeg.exe' : 'ffmpeg';
  const binPath = path.join(NODE_MODULES, '@ffmpeg-installer', subPkg, binName);
  return fs.existsSync(binPath) ? binPath : null;
}

function getBundledYtdlp(): string | null {
  const binName = IS_WINDOWS ? 'yt-dlp.exe' : 'yt-dlp';
  const binPath = path.join(NODE_MODULES, 'youtube-dl-exec', 'bin', binName);
  return fs.existsSync(binPath) ? binPath : null;
}

const bundledFfmpeg = getBundledFfmpeg();
const bundledYtdlp = getBundledYtdlp();

export const PATHS = {
  root: ROOT,
  bin: path.join(BASE, 'bin'),

  // ffmpeg: 환경변수 > 번들 > PATH(ffmpeg) 폴백
  ffmpeg:
    process.env.ARC_FFMPEG ||
    bundledFfmpeg ||
    'ffmpeg',

  // yt-dlp: 환경변수 > Electron resources > 프로젝트 bin/ > npm 패키지
  ytdlp:
    process.env.ARC_YTDLP ||
    (() => {
      const binName = IS_WINDOWS ? 'yt-dlp.exe' : 'yt-dlp';
      // Electron production: process.resourcesPath/bin/yt-dlp (Electron 전용 속성)
      const electronProc = process as NodeJS.Process & { resourcesPath?: string };
      const resPath = electronProc.resourcesPath
        ? path.join(electronProc.resourcesPath, 'bin', binName)
        : null;
      if (resPath && fs.existsSync(resPath)) return resPath;
      // dev / source 실행: 프로젝트 bin/yt-dlp
      const localBin = path.join(BASE, 'bin', binName);
      if (fs.existsSync(localBin)) return localBin;
      return bundledYtdlp || localBin;
    })(),

  // python 관련 경로 — Whisper API 사용 후 deprecated (호환성을 위해 유지)
  python: path.join(ROOT, 'python'),
  pythonExe:
    process.env.ARC_PYTHON_EXE ||
    (IS_WINDOWS
      ? 'C:\\arc-clipper-venv\\Scripts\\python.exe'
      : path.join(os.homedir(), 'arc-clipper-venv', 'bin', 'python3')),
  transcribeScript: path.join(ROOT, 'python', 'transcribe.py'),

  data: path.join(BASE, 'data'),
  db: path.join(BASE, 'data', 'arc-clipper.db'),
  workspace: path.join(BASE, 'workspace'),
};

/**
 * 프로젝트 저장 폴더 경로 결정.
 */
export function projectDir(projectId: string, workspaceRoot?: string | null): string {
  const root = workspaceRoot && workspaceRoot.trim() ? workspaceRoot.trim() : PATHS.workspace;
  return path.join(root, projectId);
}

export function projectPaths(projectId: string, workspaceRoot?: string | null) {
  const dir = projectDir(projectId, workspaceRoot);
  return {
    dir,
    source: path.join(dir, 'source.mp4'),
    audio: path.join(dir, 'audio.wav'),
    audioMp3: path.join(dir, 'audio.mp3'), // Whisper API 업로드용 (압축)
    transcript: path.join(dir, 'transcript.json'),
    hooks: path.join(dir, 'hooks.json'),
    clips: path.join(dir, 'clips'),
    temp: path.join(dir, 'temp'),
    infoJson: path.join(dir, 'source.mp4.info.json'),
  };
}

/**
 * 사용자 입력 경로 검증. OS별 절대 경로 모두 허용.
 */
export function validateWorkspacePath(input: string): string | null {
  const trimmed = input?.trim() || '';
  if (!trimmed) return null;
  if (!path.isAbsolute(trimmed)) {
    const example = IS_WINDOWS ? 'D:\\ARK_Shorts' : '/Users/your-name/Movies/Shorts';
    throw new Error(`절대 경로를 입력해주세요. 예: ${example}`);
  }
  return path.resolve(trimmed);
}

export function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
