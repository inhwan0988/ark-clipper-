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

    // stderr 캡처 — 디버깅용 (마지막 4KB만 유지)
    let stderrBuf = '';
    proc.stderr?.on('data', (chunk: Buffer) => {
      stderrBuf += chunk.toString();
      if (stderrBuf.length > 4096) stderrBuf = stderrBuf.slice(-4096);
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        const userMessage = '오디오 추출 중 오류가 발생했습니다. 영상 파일이 손상되었거나 지원하지 않는 형식일 수 있어요.';
        emitProgress({
          projectId,
          step: 'extract_audio',
          status: 'error',
          progress: 0,
          message: userMessage,
        });
        console.error(`[ffmpeg] extract_audio failed (code ${code})\n${stderrBuf.slice(-1000)}`);
        reject(new Error(userMessage));
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

export type LayoutStyle = 'letterbox' | 'crop_vertical' | 'custom_background';

/** custom_background 입력 종류 (확장자 기반 자동 감지). */
function detectBackgroundKind(p: string): 'image' | 'video' | null {
  const ext = path.extname(p).toLowerCase();
  if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) return 'image';
  if (['.mp4', '.mov', '.webm', '.mkv'].includes(ext)) return 'video';
  return null;
}

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
  /** 영상 재생 속도 (1.0 = 정상, 2.0 = 2배속). default 1.0
   *  ffmpeg setpts(video) + atempo(audio)로 출력에 영구 적용.
   *  허용 범위: 0.5 ~ 2.0 (atempo 단일 호출 제한) */
  playbackSpeed?: number;
  /** 배경 영상 zoom (1.0 = 100%, 1.5 = 150%) — crop_vertical 모드에서만 적용 */
  bgZoom?: number;
  /** 배경 가로 오프셋 (1080 기준 px, ±540 범위) — crop_vertical 모드에서만 적용 */
  bgOffsetX?: number;
  /** 배경 세로 오프셋 (1920 기준 px, ±960 범위) — crop_vertical 모드에서만 적용 */
  bgOffsetY?: number;
  /**
   * custom_background 모드에서 사용할 배경 파일 (이미지/영상) 절대경로.
   * 확장자로 자동 감지 (jpg/png/webp = image, mp4/mov/webm/mkv = video).
   * layout이 'custom_background'가 아니면 무시.
   */
  customBackgroundPath?: string;
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

/** atempo는 0.5~2.0 단일 호출만 안전. 범위 밖이면 clamp. */
function clampSpeed(s: number | undefined): number {
  if (!s || !Number.isFinite(s)) return 1;
  return Math.max(0.5, Math.min(2.0, s));
}

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

  // custom_background 입력 검증 — 파일이 실제 존재하고 확장자가 지원되는지 확인.
  // 미존재/미지원 시 letterbox로 fallback (사용자에게 부드러운 degrade).
  // 진단 로그: layout / path 도달 여부를 항상 출력 → 회귀 발생 시 원인 추적 빠름.
  console.log(
    `[generateClip] layout=${opts.layout} customBgPath=${opts.customBackgroundPath ?? '(none)'}`,
  );
  const pathExists =
    !!opts.customBackgroundPath && fs.existsSync(opts.customBackgroundPath);
  const useCustomBg = opts.layout === 'custom_background' && pathExists;
  const bgKind = useCustomBg ? detectBackgroundKind(opts.customBackgroundPath!) : null;
  if (opts.layout === 'custom_background' && (!useCustomBg || !bgKind)) {
    console.warn(
      `[generateClip] custom_background fallback → letterbox ` +
        `(path=${opts.customBackgroundPath}, exists=${pathExists}, kind=${bgKind})`,
    );
  }
  const effectiveLayout: LayoutStyle =
    opts.layout === 'custom_background' && useCustomBg && bgKind
      ? 'custom_background'
      : opts.layout === 'custom_background'
        ? 'letterbox'
        : opts.layout;

  return new Promise((resolve, reject) => {
    // sourceVf: 원본 video를 1080x1920 캔버스에 어떻게 배치할지 결정하는 chain.
    // custom_background 모드에서는 캔버스 대신 source만 스케일하고, 별도 입력의 bg와 overlay.
    let sourceVf = '';

    if (effectiveLayout === 'crop_vertical') {
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
      sourceVf =
        `scale=iw*${z}:ih*${z}` +
        `,crop=ih*9/16:ih:` +
        `'(iw-ih*9/16)/2 - (${ox})*ih*9/16/1080':` +
        `'0 - (${oy})*ih/1920'` +
        `,scale=${OUTPUT_W}:${OUTPUT_H}`;
    } else if (effectiveLayout === 'custom_background') {
      // custom_background: 원본 영상을 1080 너비 기준 비율 유지 스케일 (letterbox와 동일).
      // 이후 별도 bg input과 overlay (filter_complex)로 합성.
      sourceVf = `scale=${OUTPUT_W}:-2:force_original_aspect_ratio=decrease`;
    } else {
      // letterbox: 1080 너비로 스케일 + 1080x1920 캔버스 패딩 (검정 배경)
      sourceVf = `scale=${OUTPUT_W}:-2:force_original_aspect_ratio=decrease,pad=${OUTPUT_W}:${OUTPUT_H}:0:${VIDEO_Y}:black`;
    }

    // canvasVf: 캔버스(1080x1920) 위에 자막/제목/배속 등 공통 effects.
    // custom_background는 sourceVf 단계 후 overlay로 캔버스를 만들고 → canvasVf를 적용.
    let canvasVf = '';

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
      canvasVf += (canvasVf ? ',' : '') + `subtitles='${escapedPath}':fontsdir='${fontsdir}':charenc=UTF-8`;
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
          canvasVf +=
            (canvasVf ? ',' : '') +
            `drawtext=fontfile='${fontFile}'` +
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

    // 배속 처리 (1.0이 아닐 때만 setpts/atempo 추가).
    // 자막/타이틀은 위 vf chain에서 이미 frame에 burn-in 됐으므로,
    // setpts는 chain 마지막에 붙여서 frame 표시 속도만 조절 → 자막도 같이 빨라짐.
    const speed = clampSpeed(opts.playbackSpeed);
    if (speed !== 1) {
      canvasVf += (canvasVf ? ',' : '') + `setpts=PTS/${speed}`;
    }

    // ⚠️ -ss를 input 앞에 두면 ffmpeg가 PTS를 리셋하지 않아 자막이 영상 시간과
    // 안 맞는 문제(첫 자막에서 멈춤)가 발생함. input 뒤로 옮겨서 output seek로
    // 처리하면 PTS가 0부터 다시 시작되어 자막(클립 상대 시간)과 정확히 매칭됨.
    const clipDuration = opts.endTime - opts.startTime;
    const args: string[] = [];

    if (effectiveLayout === 'custom_background' && opts.customBackgroundPath && bgKind) {
      // 입력 순서: [0] bg (image: -loop 1 / video: -stream_loop -1), [1] source video (with -ss/-t)
      // 영상 길이만큼 bg를 늘려야 하므로 -t를 bg에도 적용.
      if (bgKind === 'image') {
        args.push('-loop', '1', '-t', clipDuration.toString(), '-i', opts.customBackgroundPath);
      } else {
        args.push('-stream_loop', '-1', '-t', clipDuration.toString(), '-i', opts.customBackgroundPath);
      }
      args.push('-i', pp.source, '-ss', opts.startTime.toString(), '-t', clipDuration.toString());

      // filter_complex:
      //   [0:v] bg → 1080x1920 cover-fit
      //   [1:v] source → sourceVf (이미 1080 비율 유지 스케일)
      //   [bg][fg] overlay center horizontal, top y=VIDEO_Y (letterbox 정렬과 동일)
      //   [overlayed] canvasVf → 자막/제목/setpts (있을 때만)
      const bgChain =
        `[0:v]scale=${OUTPUT_W}:${OUTPUT_H}:force_original_aspect_ratio=increase,crop=${OUTPUT_W}:${OUTPUT_H},setsar=1[bg]`;
      const fgChain = `[1:v]${sourceVf},setsar=1[fg]`;
      const overlayOut = canvasVf ? '[overlayed]' : '[outv]';
      const overlayChain = `[bg][fg]overlay=(W-w)/2:${VIDEO_Y}${overlayOut}`;
      const tailChain = canvasVf ? `;[overlayed]${canvasVf}[outv]` : '';
      const filterComplex = `${bgChain};${fgChain};${overlayChain}${tailChain}`;

      args.push(
        '-filter_complex', filterComplex,
        '-map', '[outv]',
        '-map', '1:a?',  // source의 오디오만 사용 (bg 오디오 무시)
      );
    } else {
      // 일반 경로 (letterbox / crop_vertical): -i source + -vf
      const finalVf = canvasVf ? `${sourceVf},${canvasVf}` : sourceVf;
      args.push('-i', pp.source, '-ss', opts.startTime.toString(), '-t', clipDuration.toString(), '-vf', finalVf);
    }
    // 배속이 1.0이 아니면 audio filter도 적용 (atempo)
    if (speed !== 1) {
      args.push('-af', `atempo=${speed}`);
    }
    args.push(
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-crf', '23',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      '-y',
      outputPath,
    );

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
        console.error(`[ffmpeg] sourceVf: ${sourceVf}`);
        console.error(`[ffmpeg] canvasVf: ${canvasVf}`);
        console.error(`[ffmpeg] layout: ${effectiveLayout}`);
        console.error(`[ffmpeg] stderr (last 2000 chars):`);
        console.error(stderr.slice(-2000));
        // 사용자 친화 메시지로 변환
        const tail = stderr.toLowerCase();
        let userMessage = `클립 ${opts.clipIndex + 1} 생성 중 오류가 발생했습니다.`;
        if (tail.includes('no such file') || tail.includes('cannot open')) {
          userMessage += ' 원본 영상 또는 자막 파일을 찾을 수 없어요.';
        } else if (tail.includes('invalid argument') || tail.includes('parse')) {
          userMessage += ' 자막/제목에 사용된 문자가 처리되지 않았어요.';
        } else if (tail.includes('permission denied') || tail.includes('access')) {
          userMessage += ' 저장 폴더 접근 권한을 확인해주세요.';
        } else {
          userMessage += ' 다시 시도하거나 로그 파일을 확인해주세요.';
        }
        reject(new Error(userMessage));
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
