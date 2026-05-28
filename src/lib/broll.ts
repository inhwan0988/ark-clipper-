/**
 * [Phase 3 / Task 2] B-roll — Pexels Video API로 키워드 매칭 stock 영상 수집.
 *
 * 무료 사용 조건:
 *   - API 키 필요 (https://www.pexels.com/api/)
 *   - 환경변수 PEXELS_API_KEY (없으면 b-roll 비활성)
 *
 * 이 모듈은 fetching + caching 만 담당. 실제 ffmpeg overlay는 broll-compose.ts.
 *
 * 회피: ffmpeg-ops.ts를 만지지 않고 별도 모듈로 분리 (Phase 1 conflict 방지).
 */
import fs from 'fs';
import path from 'path';
import { PATHS, ensureDir } from './paths';

export interface PexelsVideoFile {
  id: number;
  quality: 'sd' | 'hd' | 'uhd' | string;
  file_type: string;
  width: number;
  height: number;
  link: string;
}

export interface PexelsVideo {
  id: number;
  width: number;
  height: number;
  duration: number;
  url: string;
  image: string;
  video_files: PexelsVideoFile[];
}

interface PexelsSearchResponse {
  page: number;
  per_page: number;
  total_results: number;
  videos: PexelsVideo[];
}

/**
 * Pexels Video 검색. 무료 tier — 호출자가 PEXELS_API_KEY를 가지고 있어야 함.
 *
 * 반환: 가장 적합한 비디오 1개 또는 null.
 * 선호 기준: HD (1280x720 이상), 가로형(landscape) 또는 정사각형.
 */
export async function fetchPexelsVideo(
  keyword: string,
  apiKey: string,
  options: { orientation?: 'portrait' | 'landscape' | 'square' } = {},
): Promise<PexelsVideo | null> {
  if (!apiKey || !apiKey.trim()) return null;
  if (!keyword || !keyword.trim()) return null;

  const params = new URLSearchParams({
    query: keyword.trim(),
    per_page: '5',
  });
  if (options.orientation) params.set('orientation', options.orientation);

  try {
    const res = await fetch(`https://api.pexels.com/videos/search?${params}`, {
      headers: { Authorization: apiKey.trim() },
    });
    if (!res.ok) {
      console.warn(`[broll] Pexels API ${res.status} for "${keyword}"`);
      return null;
    }
    const data = (await res.json()) as PexelsSearchResponse;
    if (!data.videos || data.videos.length === 0) return null;

    // 가장 적합한 비디오 선택: 첫 번째가 보통 가장 relevant
    return data.videos[0];
  } catch (err) {
    console.warn('[broll] Pexels fetch error:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * PexelsVideo에서 HD/SD 중 적당한 파일 URL 1개 추출.
 * 우선순위: HD(1280~1920) > SD > 첫 번째.
 */
export function pickVideoFile(video: PexelsVideo): PexelsVideoFile | null {
  if (!video.video_files || video.video_files.length === 0) return null;
  const hd = video.video_files.find((f) => f.quality === 'hd' && f.width >= 1280 && f.width <= 1920);
  if (hd) return hd;
  const sd = video.video_files.find((f) => f.quality === 'sd');
  if (sd) return sd;
  return video.video_files[0];
}

/**
 * b-roll 캐시 디렉토리. PATHS.data/broll-cache/<videoId>.mp4.
 * 같은 키워드라도 같은 video는 재사용.
 */
function brollCacheDir(): string {
  const dir = path.join(PATHS.data, 'broll-cache');
  ensureDir(dir);
  return dir;
}

/**
 * Pexels Video를 다운로드해 로컬 캐시에 저장. 이미 있으면 그대로 사용.
 * 반환: 절대경로 (cache hit/miss 무관) 또는 실패 시 null.
 */
export async function downloadPexelsVideo(video: PexelsVideo): Promise<string | null> {
  const file = pickVideoFile(video);
  if (!file) return null;
  const cacheDir = brollCacheDir();
  const outputPath = path.join(cacheDir, `${video.id}.mp4`);
  if (fs.existsSync(outputPath)) {
    try {
      const sz = fs.statSync(outputPath).size;
      if (sz > 1024) return outputPath;
      // 너무 작은 캐시는 폐기
      fs.unlinkSync(outputPath);
    } catch { /* ignore */ }
  }
  try {
    const res = await fetch(file.link);
    if (!res.ok) {
      console.warn(`[broll] download failed ${res.status} for video ${video.id}`);
      return null;
    }
    const ab = await res.arrayBuffer();
    fs.writeFileSync(outputPath, Buffer.from(ab));
    return outputPath;
  } catch (err) {
    console.warn('[broll] download error:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * 한국어 텍스트에서 명사 후보 추출 (간단 휴리스틱).
 * 조사 제거 + 영문/숫자 보존. AI 호출 없이 동작.
 */
const KOREAN_PARTICLES_SUFFIX = /(이|가|을|를|은|는|에|의|와|과|로|으로|에서|에게|한테|부터|까지|도|만|이나|거나)$/;
const STOPWORDS = new Set([
  '그것', '이것', '저것', '여기', '거기', '저기', '그래서', '근데', '하지만', '그리고',
  '진짜', '정말', '아니', '아마', '같이', '같은', '같아', '그냥', '뭐', '왜', '뭔가',
  '있는', '없는', '하는', '되는', '같은', '제가', '저는', '나는', '우리',
]);

export function extractKeywords(text: string, maxCount: number = 3): string[] {
  if (!text || !text.trim()) return [];
  // 한글, 영문, 숫자 토큰화 (공백 + 구두점 split)
  const tokens = text
    .replace(/[.,!?;:'"()[\]{}<>。、，！？]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);

  const cleaned: string[] = [];
  const seen = new Set<string>();
  for (const tok of tokens) {
    // 끝에 붙은 조사 제거 (한국어만)
    const stripped = tok.replace(KOREAN_PARTICLES_SUFFIX, '');
    const word = stripped.length >= 2 ? stripped : tok;
    if (STOPWORDS.has(word)) continue;
    if (seen.has(word)) continue;
    seen.add(word);
    cleaned.push(word);
    if (cleaned.length >= maxCount) break;
  }
  return cleaned;
}

/**
 * b-roll 기능 활성 여부.
 * 환경변수 PEXELS_API_KEY 또는 호출자가 명시적으로 키 제공 시 활성.
 */
export function isBrollEnabled(apiKeyOverride?: string): boolean {
  const key = (apiKeyOverride || process.env.PEXELS_API_KEY || '').trim();
  return key.length > 0;
}

export function getPexelsApiKey(override?: string): string {
  return (override || process.env.PEXELS_API_KEY || '').trim();
}
