import { spawn } from 'child_process';
import { PATHS, ensureDir } from './paths';
import { getProjectPaths } from './db';
import { emitProgress } from './progress-bus';
import { updateProject } from './db';
import { ffmpegEscapePath, resolveFontFile } from './fonts';
import { splitTitleLines, maxUnitsForBox } from './title-wrap';
import path from 'path';
import fs from 'fs';

/**
 * drawtext text escape — backslash, single quote, colon, percent.
 * single quote는 ffmpeg single-quoted string 안에서 escape가 까다로워
 * 시각적으로 동일한 U+2019(’)로 대체 (가장 안전).
 */
function escapeDrawtextText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/'/g, '’')
    .replace(/:/g, '\\:')
    .replace(/%/g, '\\%');
}

export async function extractAudio(projectId: string): Promise<string> {
  const pp = getProjectPaths(projectId);

  updateProject(projectId, { status: 'extracting_audio' });
  emitProgress({
    projectId,
    step: 'extract_audio',
    status: 'running',
    progress: 0,
    message: '오디오 추출 중...',
  });

  return new Promise((resolve, reject) => {
    const args = [
      '-i', pp.source,
      '-vn',
      '-acodec', 'pcm_s16le',
      '-ar', '16000',
      '-ac', '1',
      '-y',
      pp.audio,
    ];

    const proc = spawn(PATHS.ffmpeg, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    proc.on('close', (code) => {
      if (code !== 0) {
        emitProgress({
          projectId,
          step: 'extract_audio',
          status: 'error',
          progress: 0,
          message: '오디오 추출 실패',
        });
        reject(new Error(`ffmpeg extract audio exited with code ${code}`));
        return;
      }
      emitProgress({
        projectId,
        step: 'extract_audio',
        status: 'complete',
        progress: 100,
        message: '오디오 추출 완료',
      });
      resolve(pp.audio);
    });
  });
}

export type LayoutStyle = 'letterbox' | 'crop_vertical';

export interface TitleOverlay {
  text: string;
  fontName: string;
  fontSize: number;
  bold: boolean;
  color: string;
}

export interface ChannelOverlay {
  text: string;
  fontName: string;
  fontSize: number;
  bold: boolean;
  color: string;
}

export interface ClipOptions {
  projectId: string;
  clipId: string;
  startTime: number;
  endTime: number;
  subtitlePath?: string;  // 통합 ASS 파일 (자막 + 타이틀 + 채널 모두 포함)
  clipIndex: number;
  totalClips: number;
  layout: LayoutStyle;
  /** 배경 영상 zoom (1.0 = 100%, 1.5 = 150%) — crop_vertical 모드에서만 적용 */
  bgZoom?: number;
  /** 배경 가로 오프셋 (1080 기준 px, ±540 범위) — crop_vertical 모드에서만 적용 */
  bgOffsetX?: number;
  /** 배경 세로 오프셋 (1920 기준 px, ±960 범위) — crop_vertical 모드에서만 적용 */
  bgOffsetY?: number;
  /**
   * 제목 burn-in (drawtext) — 한국어 폰트가 ASS subtitle filter에서 깨지는 문제 회피.
   * fontfile 절대경로를 직접 사용해 확실히 렌더.
   */
  titleDrawtext?: {
    text: string;
    fontName: string;       // resolveFontFile로 fontFile 경로 결정
    fontSize: number;
    bold: boolean;
    color: string;          // hex (예: "FFFFFF")
    x: number;              // 1080 기준 (좌상단)
    y: number;              // 1920 기준 (좌상단)
    align: 'left' | 'center' | 'right';
    boxWidth: number;       // 1080 기준
  };
}

const OUTPUT_W = 1080;
const OUTPUT_H = 1920;
const VIDEO_Y = 600;

export async function generateClip(opts: ClipOptions): Promise<string> {
  const pp = getProjectPaths(opts.projectId);
  ensureDir(pp.clips);

  const outputPath = path.join(pp.clips, `${opts.clipId}.mp4`);

  emitProgress({
    projectId: opts.projectId,
    step: 'clip',
    status: 'running',
    progress: Math.round((opts.clipIndex / opts.totalClips) * 100),
    message: `클립 생성 중...`,
    detail: `${opts.clipIndex + 1}/${opts.totalClips}`,
  });

  return new Promise((resolve, reject) => {
    let vf = '';

    if (opts.layout === 'crop_vertical') {
      // 1. 입력을 1080×1920 9:16 영역에 cover (object-fit: cover와 동일)
      // 2. bgZoom으로 추가 확대
      // 3. bgOffsetX/Y 만큼 view window 이동
      const z = Math.max(1, opts.bgZoom ?? 1);
      const ox = opts.bgOffsetX ?? 0;
      const oy = opts.bgOffsetY ?? 0;
      // ih*9/16 = 9:16 cropped width in input scale. center crop.
      // crop x = (iw - ih*9/16)/2 - (ox * (ih*9/16) / 1080)  ← bgOffsetX(1080 기준)을 crop scale로 환산
      // 미리보기에서 translate는 video width(=1080 cover) 기준 px. ffmpeg crop은 input scale.
      // 정확한 매핑: crop_width = ih * 9/16; offset_scale = crop_width / 1080
      // 미리보기 translate(OX%, OY%) → 실제 1080×1920 캔버스에서 OX px 이동 → input에서 OX * crop_width/1080 이동
      // 반대 방향으로 crop 위치 조정 → ` - ox*crop_width/1080`
      // bgZoom: scale * Z 적용 후 동일 비율로 crop
      vf =
        `scale=iw*${z}:ih*${z}` +
        `,crop=ih*9/16:ih:` +
        `'(iw-ih*9/16)/2 - (${ox})*ih*9/16/1080':` +
        `'0 - (${oy})*ih/1920'` +
        `,scale=${OUTPUT_W}:${OUTPUT_H}`;
    } else {
      // letterbox: 1080 너비로 스케일 + 1080x1920 캔버스 패딩 (검정 배경)
      vf = `scale=${OUTPUT_W}:-2:force_original_aspect_ratio=decrease,pad=${OUTPUT_W}:${OUTPUT_H}:0:${VIDEO_Y}:black`;
    }

    // 자막 + 채널명을 ASS 파일 하나로 burn-in (title은 drawtext로 별도 처리)
    if (opts.subtitlePath && fs.existsSync(opts.subtitlePath)) {
      const escapedPath = ffmpegEscapePath(opts.subtitlePath);
      // ARC_FONTS_DIR(번들된 Pretendard 등)을 우선 사용해야 ASS가 한글 폰트를 찾음.
      // Windows에서 시스템 폰트 폴더만 가리키면 ASS가 Pretendard fontfamily를 못 찾아 □□□.
      const bundledFontsDir = process.env.ARC_FONTS_DIR;
      const systemFontsDir =
        process.platform === 'darwin'
          ? '/System/Library/Fonts'
          : process.platform === 'win32'
            ? 'C:/Windows/Fonts'
            : '/usr/share/fonts';
      const fontsdirRaw = bundledFontsDir && fs.existsSync(bundledFontsDir)
        ? bundledFontsDir
        : systemFontsDir;
      const fontsdir = ffmpegEscapePath(fontsdirRaw);
      vf += `,subtitles='${escapedPath}':fontsdir='${fontsdir}':charenc=UTF-8`;
    }

    // 제목 burn-in — drawtext filter (fontfile 절대경로 사용)
    // bold는 (a) borderw 두껍게 + (b) double-draw(글자를 약간 어긋난 위치에 한 번 더 그림)로
    //   실제 글자 stroke가 두꺼워진 효과를 냄. face_index는 ffmpeg 호환성 떨어져 안 씀.
    if (opts.titleDrawtext && opts.titleDrawtext.text.trim()) {
      const t = opts.titleDrawtext;
      const fontPath = resolveFontFile(t.fontName, t.bold);
      // 진단: 폰트 파일 실제 존재 여부 로그 (Windows에서 한글 □□□ 문제 추적)
      const fontExists = fs.existsSync(fontPath);
      console.log(`[drawtext] fontPath=${fontPath} (exists=${fontExists}, bold=${t.bold})`);
      if (!fontExists) {
        console.error(`[drawtext] ⚠️ FONT FILE NOT FOUND: ${fontPath}`);
      }
      const fontFile = ffmpegEscapePath(fontPath);
      const maxUnits = maxUnitsForBox(t.boxWidth, t.fontSize);
      const lines = splitTitleLines(t.text, maxUnits).slice(0, 3);
      const lineHeight = Math.round(t.fontSize * 1.25);
      const colorHex = t.color.replace(/^#/, '').toUpperCase();
      const borderW = t.bold
        ? Math.max(4, Math.round(t.fontSize * 0.08))
        : Math.max(2, Math.round(t.fontSize * 0.04));
      // bold면 글자를 살짝 어긋난 위치에 한 번 더 그려서 stroke 두께를 키움 (fake bold)
      const offsets = t.bold ? [-1, 0, 1] : [0];
      lines.forEach((line, i) => {
        const escaped = escapeDrawtextText(line);
        const yPos = t.y + i * lineHeight;
        offsets.forEach((dx) => {
          let xExpr: string;
          if (t.align === 'center' || !t.align) {
            xExpr = `${t.x}-text_w/2${dx >= 0 ? '+' : ''}${dx}`;
          } else if (t.align === 'right') {
            xExpr = `${t.x}-text_w${dx >= 0 ? '+' : ''}${dx}`;
          } else {
            xExpr = `${t.x}${dx >= 0 ? '+' : ''}${dx}`;
          }
          vf +=
            `,drawtext=fontfile='${fontFile}'` +
            `:text='${escaped}'` +
            `:x='${xExpr}'` +
            `:y=${yPos}` +
            `:fontsize=${t.fontSize}` +
            `:fontcolor=0x${colorHex}` +
            `:borderw=${borderW}` +
            `:bordercolor=black`;
        });
      });
    }

    // ⚠️ -ss를 input 앞에 두면 ffmpeg가 PTS를 리셋하지 않아 자막이 영상 시간과
    // 안 맞는 문제(첫 자막에서 멈춤)가 발생함. input 뒤로 옮겨서 output seek로
    // 처리하면 PTS가 0부터 다시 시작되어 자막(클립 상대 시간)과 정확히 매칭됨.
    const clipDuration = opts.endTime - opts.startTime;
    const args = [
      '-i', pp.source,
      '-ss', opts.startTime.toString(),
      '-t', clipDuration.toString(),
      '-vf', vf,
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-crf', '23',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      '-y',
      outputPath,
    ];

    const proc = spawn(PATHS.ffmpeg, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stderr = '';
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      if (code !== 0) {
        // 1차 방어: ffmpeg 실패 시 부분 생성된 outputPath 삭제 (0B 파일 잔류 방지)
        try {
          if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        } catch {
          /* ignore */
        }
        console.error(`[ffmpeg] clip ${opts.clipId} failed (code ${code})`);
        console.error(`[ffmpeg] vf: ${vf}`);
        console.error(`[ffmpeg] stderr (last 2000 chars):`);
        console.error(stderr.slice(-2000));
        reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-300)}`));
        return;
      }
      // 2차 방어: 성공이지만 출력 파일이 빈/너무 작은 경우 (ffmpeg가 success exit 했지만 결과 깨진 경우)
      try {
        const sz = fs.statSync(outputPath).size;
        if (sz < 1024) {
          try {
            fs.unlinkSync(outputPath);
          } catch {
            /* ignore */
          }
          console.error(`[ffmpeg] clip ${opts.clipId} output too small: ${sz} bytes`);
          console.error(`[ffmpeg] stderr (last 2000 chars):`);
          console.error(stderr.slice(-2000));
          reject(new Error(`출력 파일이 너무 작습니다 (${sz} bytes). 재생성이 필요합니다.`));
          return;
        }
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
        return;
      }
      resolve(outputPath);
    });
  });
}
