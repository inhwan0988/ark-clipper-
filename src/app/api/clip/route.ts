import { NextResponse } from 'next/server';
import { v4 as uuid } from 'uuid';
import { generateClip, type LayoutStyle } from '@/lib/ffmpeg-ops';
import { generateSubtitleFile } from '@/lib/subtitle-gen';
import type { TextOverlay, SubtitleConfig } from '@/lib/subtitle-gen';
import { getProject, createClip, updateClip, updateProject, getProjectPaths, getClip } from '@/lib/db';
import { ensureDir } from '@/lib/paths';
import { emitProgress } from '@/lib/progress-bus';
import fs from 'fs';
import type { HookSuggestion, Transcript } from '@/types';

/** 클립 전용 customization (hook에 첨가되어 전달). 미설정 시 payload-level default 사용. */
interface HookCustomization {
  layout?: LayoutStyle;
  titleFontName?: string;
  titleFontSize?: number;
  titleColor?: string;
  titleBold?: boolean;
  titleAlign?: 'left' | 'center' | 'right';
  titleX?: number;
  titleY?: number;
  titleXCrop?: number;
  titleYCrop?: number;
  titleBoxWidth?: number;
  channelEnabled?: boolean;
  channelText?: string;
  channelFontName?: string;
  channelFontSize?: number;
  channelColor?: string;
  channelBold?: boolean;
  channelAlign?: 'left' | 'center' | 'right';
  channelX?: number;
  channelY?: number;
  subtitleEnabled?: boolean;
  subtitleFontName?: string;
  subtitleFontSize?: number;
  subtitleColor?: string;
  subtitleBold?: boolean;
  subtitleOutlineEnabled?: boolean;
  subtitleOutlineColor?: string;
  subtitleOutlineWidth?: number;
  subtitleBgEnabled?: boolean;
  subtitleBgColor?: string;
  subtitleBgOpacity?: number;
  subtitleY?: number;
  subtitleMaxCharsPerLine?: number;
  bgZoom?: number;
  bgOffsetX?: number;
  bgOffsetY?: number;
  /** 배속 (1.0 ~ 2.0). 출력 mp4에 영구 적용. */
  playbackSpeed?: number;
  /** custom_background 모드에서 사용할 배경 파일 (이미지/영상) 절대경로 (hook별 독립). */
  customBackgroundPath?: string;
}

interface ClipRequest {
  projectId: string;
  selectedHooks: Array<
    HookSuggestion & {
      id?: string;
      titleX?: number;
      titleY?: number;
      /** 이 hook 전용 customization (다른 hook과 독립) */
      customization?: HookCustomization;
    }
  >;
  layout?: LayoutStyle;
  // payload-level default — hook.customization이 없을 때 fallback
  title?: Omit<TextOverlay, 'text'>;
  channel?: TextOverlay;
  subtitle?: SubtitleConfig;
  bgZoom?: number;
  bgOffsetX?: number;
  bgOffsetY?: number;
  /** custom_background 모드 default 경로 (hook customization에 없을 때 fallback). */
  customBackgroundPath?: string;
}

export async function POST(req: Request) {
  const body = await req.json() as ClipRequest;
  const { projectId, selectedHooks, layout = 'letterbox', title, channel, subtitle, bgZoom, bgOffsetX, bgOffsetY, customBackgroundPath } = body;

  const project = getProject(projectId);
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const pp = getProjectPaths(projectId);
  ensureDir(pp.clips);

  // 자막이 활성화되어 있으면 transcript 로드
  let transcript: Transcript | null = null;
  if (subtitle && fs.existsSync(pp.transcript)) {
    try {
      transcript = JSON.parse(fs.readFileSync(pp.transcript, 'utf-8'));
    } catch { /* ignore */ }
  }

  updateProject(projectId, { status: 'clipping' });

  const results: Array<{ clipId: string; outputPath: string; title: string }> = [];
  const failures: Array<{ clipId: string; title: string; error: string }> = [];

  // 방어층: 길이 < 2초이거나 시간이 비정상이면 skip (의미 없는 클립 방지)
  const validHooks = selectedHooks.filter((hook) => {
    const len = hook.end_time - hook.start_time;
    if (!isFinite(hook.start_time) || !isFinite(hook.end_time) || len < 2) {
      console.warn(
        `[clip] hook skipped — invalid timing (${hook.start_time}~${hook.end_time}): "${hook.title}"`,
      );
      return false;
    }
    if (!hook.title || hook.title.trim().length < 1) {
      console.warn(`[clip] hook skipped — empty title @ ${hook.start_time}~${hook.end_time}`);
      return false;
    }
    return true;
  });

  for (let i = 0; i < validHooks.length; i++) {
    const hook = validHooks[i];
    const clipId = hook.id || uuid();

    // 이 클립의 레이아웃: hook.layout > hook.customization.layout > 전역 설정
    const clipLayout: LayoutStyle =
      (hook.layout as LayoutStyle) ||
      (hook.customization?.layout as LayoutStyle) ||
      layout;

    // 기존 clip이 있으면 update, 없으면 새로 create (편집 후 단일 재생성용)
    const existing = getClip(clipId);
    if (existing) {
      updateClip(clipId, {
        start_time: hook.start_time,
        end_time: hook.end_time,
        title: hook.title,
        status: 'processing',
      });
    } else {
      createClip({
        id: clipId,
        project_id: projectId,
        start_time: hook.start_time,
        end_time: hook.end_time,
        title: hook.title,
        reason: hook.reason,
        confidence: hook.confidence,
        is_manual: 0,
      });
      updateClip(clipId, { status: 'processing' });
    }

    try {
      // 클립별 customization 적용 — hook.customization 우선, 없으면 payload-level default
      const cust = hook.customization;

      // 채널 (hook 전용 customization이 있으면 그것 사용)
      const channelOverlay: TextOverlay | undefined = cust
        ? (cust.channelEnabled && cust.channelText && cust.channelText.trim()
            ? {
                text: cust.channelText,
                fontName: cust.channelFontName ?? 'Pretendard',
                fontSize: cust.channelFontSize ?? 44,
                color: cust.channelColor ?? 'FFFFFF',
                bold: cust.channelBold ?? false,
                align: cust.channelAlign ?? 'center',
                x: cust.channelX,
                y: cust.channelY,
              }
            : undefined)
        : channel;

      // 자막 (hook 전용 customization이 있으면 그것 사용)
      const subtitleConfig: SubtitleConfig | undefined = cust
        ? (cust.subtitleEnabled
            ? {
                fontName: cust.subtitleFontName ?? 'Pretendard',
                fontSize: cust.subtitleFontSize ?? 56,
                color: cust.subtitleColor ?? 'FFFFFF',
                bold: cust.subtitleBold ?? true,
                outlineEnabled: cust.subtitleOutlineEnabled ?? true,
                outlineColor: cust.subtitleOutlineColor ?? '000000',
                outlineWidth: cust.subtitleOutlineWidth ?? 4,
                bgEnabled: cust.subtitleBgEnabled ?? false,
                bgColor: cust.subtitleBgColor ?? '000000',
                bgOpacity: cust.subtitleBgOpacity ?? 60,
                y: cust.subtitleY ?? 1670,
                maxCharsPerLine: cust.subtitleMaxCharsPerLine ?? 13,
              }
            : undefined)
        : subtitle;

      // ASS는 channel+subtitle만. title은 drawtext로 별도 (한국어 폰트 보장)
      // subtitle-gen은 letterbox|crop_vertical만 받음 — custom_background는 letterbox와
      // 시각적으로 동일한 자막 정렬을 쓰므로 letterbox로 mapping.
      const subtitleLayout: 'letterbox' | 'crop_vertical' =
        clipLayout === 'crop_vertical' ? 'crop_vertical' : 'letterbox';
      const subtitlePath = generateSubtitleFile(
        transcript,
        hook.start_time,
        hook.end_time,
        pp.clips,
        clipId,
        subtitleLayout,
        undefined,
        channelOverlay,
        subtitleConfig
      );

      // title drawtext payload — hook.customization 우선
      // custom_background는 letterbox와 동일한 title 좌표계 사용 (titleX/titleY).
      const useCropTitlePos = clipLayout === 'crop_vertical';
      const titleX = cust
        ? (useCropTitlePos ? cust.titleXCrop : cust.titleX) ?? 540
        : hook.titleX ?? title?.x ?? 540;
      const titleY = cust
        ? (useCropTitlePos ? cust.titleYCrop : cust.titleY) ?? 180
        : hook.titleY ?? title?.y ?? 180;
      const titleDrawtext = cust
        ? {
            text: hook.title,
            fontName: cust.titleFontName ?? 'Pretendard',
            fontSize: cust.titleFontSize ?? 86,
            bold: cust.titleBold ?? true,
            color: cust.titleColor ?? 'FFFFFF',
            x: titleX,
            y: titleY,
            align: cust.titleAlign ?? 'center',
            boxWidth: cust.titleBoxWidth ?? 1080,
          }
        : title
          ? {
              text: hook.title,
              fontName: title.fontName,
              fontSize: title.fontSize,
              bold: title.bold,
              color: title.color,
              x: titleX,
              y: titleY,
              align: title.align ?? 'center',
              boxWidth: title.boxWidth ?? 1080,
            }
          : undefined;

      const outputPath = await generateClip({
        projectId,
        clipId,
        startTime: hook.start_time,
        endTime: hook.end_time,
        subtitlePath,
        clipIndex: i,
        totalClips: selectedHooks.length,
        layout: clipLayout,
        bgZoom: cust?.bgZoom ?? bgZoom,
        bgOffsetX: cust?.bgOffsetX ?? bgOffsetX,
        bgOffsetY: cust?.bgOffsetY ?? bgOffsetY,
        // 배속을 ffmpeg에 전달 → 출력 mp4에 영구 적용
        playbackSpeed: cust?.playbackSpeed ?? 1,
        // custom_background 파일 경로 (hook 우선, payload default fallback).
        // 실제 사용은 ffmpeg-ops.ts에서 layout === 'custom_background'일 때만.
        customBackgroundPath:
          cust?.customBackgroundPath ?? customBackgroundPath,
        titleDrawtext,
      });

      updateClip(clipId, { status: 'complete', output_path: outputPath });
      results.push({ clipId, outputPath, title: hook.title });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '클립 생성 실패';
      updateClip(clipId, { status: 'error' });
      console.error(`Clip ${clipId} failed:`, err);
      failures.push({ clipId, title: hook.title, error: msg });
    }
  }

  // 부분 실패 노출 — 사용자가 "왜 적게 나왔지?" 혼란 방지
  const totalRequested = selectedHooks.length;
  const succeeded = results.length;
  const failed = failures.length;

  if (succeeded === 0) {
    emitProgress({
      projectId,
      step: 'clip',
      status: 'error',
      progress: 100,
      message: `클립 생성 실패 — ${failed}개 모두 오류`,
    });
    updateProject(projectId, { status: 'error' });
    return NextResponse.json(
      { results: [], failures, message: `${failed}개 클립 모두 실패` },
      { status: 500 },
    );
  }

  const message =
    failed > 0
      ? `클립 ${succeeded}개 완료, ${failed}개 실패 (총 ${totalRequested}개 요청)`
      : `클립 생성 완료 - ${succeeded}개 쇼츠`;

  emitProgress({
    projectId,
    step: 'clip',
    status: 'complete',
    progress: 100,
    message,
  });

  updateProject(projectId, { status: 'complete' });
  return NextResponse.json({ results, failures, totalRequested });
}
