'use client';

import { useEffect, useRef, useState } from 'react';
import type { ClipCustomization } from './clip-customizer';
import { SubtitleIndicator } from './subtitle-indicator';

interface HookPreviewCardProps {
  videoSrc: string;
  startTime: number;
  endTime: number;
  title: string;
  customization: ClipCustomization;
  selected: boolean;
  focused: boolean;
  confidence: number;
  index: number;
  onSelect: () => void;
  onFocus: () => void;
  onToggle: () => void;
}

const OUTPUT_W = 1080;
const OUTPUT_H = 1920;
const VIDEO_Y = 600;
const VIDEO_H_16_9 = 608;

/** 제목 2줄 분할: 길면 "…"로 절약 */
function splitKoreanLines(text: string, maxChars: number): string[] {
  if (!text) return [];
  const t = text.trim();
  if (t.length <= maxChars) return [t];

  let firstBreak = t.lastIndexOf(' ', maxChars);
  if (firstBreak <= maxChars / 2) firstBreak = maxChars;
  const line1 = t.slice(0, firstBreak).trim();
  let line2 = t.slice(firstBreak).trim();
  if (line2.length > maxChars) {
    line2 = line2.slice(0, Math.max(1, maxChars - 1)).trim() + '…';
  }
  return [line1, line2];
}

function alignTransform(align: 'left' | 'center' | 'right', vertical: 'top' | 'bottom'): string {
  const tx = align === 'left' ? '0' : align === 'right' ? '-100%' : '-50%';
  const ty = vertical === 'top' ? '0' : '-100%';
  return `translate(${tx}, ${ty})`;
}


function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function HookPreviewCard({
  videoSrc, startTime, endTime, title, customization,
  selected, focused, confidence, index,
  onFocus, onToggle,
}: HookPreviewCardProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [previewWidth, setPreviewWidth] = useState(220);
  const [hovering, setHovering] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [seeked, setSeeked] = useState(false);

  // 화면에 보이는지 감지 (보이지 않으면 영상 로드 안 함)
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => setIsVisible(e.isIntersecting));
      },
      { rootMargin: '200px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // 영상 시킹: 메타데이터 로드 시 + 즉시 시도 (이미 로드된 경우)
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    setSeeked(false);

    let cancelled = false;
    const seekTo = () => {
      if (cancelled) return;
      try {
        v.currentTime = startTime;
      } catch { /* ignore */ }
    };

    const onSeeked = () => { if (!cancelled) setSeeked(true); };
    const onLoaded = () => seekTo();
    const onCanPlay = () => seekTo();

    // 이미 메타데이터 로드된 경우 즉시 시킹
    if (v.readyState >= 1) {
      seekTo();
    }

    v.addEventListener('loadedmetadata', onLoaded);
    v.addEventListener('canplay', onCanPlay);
    v.addEventListener('seeked', onSeeked);

    // 영상 로드 강제 트리거 (가시 영역이면)
    if (isVisible && v.preload === 'none') {
      v.preload = 'metadata';
      v.load();
    }

    return () => {
      cancelled = true;
      v.removeEventListener('loadedmetadata', onLoaded);
      v.removeEventListener('canplay', onCanPlay);
      v.removeEventListener('seeked', onSeeked);
    };
  }, [startTime, isVisible]);

  // 호버 재생
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (hovering) {
      v.currentTime = startTime;
      v.play().catch(() => {});
    } else {
      v.pause();
      try { v.currentTime = startTime; } catch { /* ignore */ }
    }
  }, [hovering, startTime]);

  // 호버 중 끝 도달 시 시작점으로 되감기
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTimeUpdate = () => {
      if (hovering && v.currentTime >= endTime) {
        v.currentTime = startTime;
      }
    };
    v.addEventListener('timeupdate', onTimeUpdate);
    return () => v.removeEventListener('timeupdate', onTimeUpdate);
  }, [hovering, startTime, endTime]);

  // 카드 너비 측정 (스케일 계산용)
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setPreviewWidth(el.offsetWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scale = previewWidth / OUTPUT_W;
  // 제목: 13자 기준 분할 (잘리지 않음)
  const titleLines = splitKoreanLines(title, 13);
  const length = endTime - startTime;

  // 레이아웃별 제목 위치 (titleX/Y는 letterbox용, titleXCrop/YCrop은 crop_vertical용)
  const titleX = customization.layout === 'crop_vertical'
    ? (customization.titleXCrop ?? 540)
    : (customization.titleX ?? 540);
  const titleY = customization.layout === 'crop_vertical'
    ? (customization.titleYCrop ?? 200)
    : (customization.titleY ?? 180);

  return (
    <div
      onClick={onFocus}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      className={`flex-shrink-0 w-[220px] cursor-pointer transition-all ${
        focused ? 'scale-105' : 'opacity-80 hover:opacity-100'
      }`}
    >
      {/* 9:16 미리보기 (흰색 테두리로 쇼츠 영역 강조) */}
      <div
        ref={wrapRef}
        className={`relative bg-[#0a1428] overflow-hidden rounded-lg ring-2 transition-colors ${
          focused ? 'ring-blue-500' : selected ? 'ring-white/80' : 'ring-white/40'
        }`}
        style={{ aspectRatio: '9/16' }}
      >
        {/* 로딩 인디케이터 (영상 시킹 완료 전) */}
        {isVisible && !seeked && !hovering && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#0a1428]/40 pointer-events-none">
            <div className="w-6 h-6 border-2 border-white/60 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {/* 인덱스 배지 */}
        <div className="absolute top-2 left-2 z-30 px-1.5 py-0.5 bg-[#0a1428]/70 rounded text-white text-xs font-bold backdrop-blur">
          #{index + 1}
        </div>

        {/* 체크박스 */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          className={`absolute top-2 right-2 z-30 w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${
            selected ? 'bg-[#4988C4] border-[#4988C4]' : 'bg-[#0a1428]/70 border-white/70 backdrop-blur'
          }`}
        >
          {selected && (
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>

        {/* 신뢰도 + 길이 (하단 좌측) */}
        <div className="absolute bottom-1 left-1 z-30 flex gap-1">
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium backdrop-blur ${
            confidence >= 0.8 ? 'bg-green-500/80 text-white' :
            confidence >= 0.6 ? 'bg-yellow-500/80 text-white' :
            'bg-[#243a5c]/80 text-gray-100'
          }`}>
            {Math.round(confidence * 100)}%
          </span>
          <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#0a1428]/70 text-white backdrop-blur">
            {length.toFixed(0)}초
          </span>
        </div>

        {customization.layout === 'letterbox' ? (
          <>
            <div
              className="absolute left-0 right-0 bg-[#0a1428]"
              style={{
                top: `${(VIDEO_Y / OUTPUT_H) * 100}%`,
                height: `${(VIDEO_H_16_9 / OUTPUT_H) * 100}%`,
              }}
            >
              <video ref={videoRef} src={videoSrc} className="w-full h-full object-contain" preload={isVisible ? 'metadata' : 'none'} muted playsInline />
            </div>

            {title && (
              <div
                className="absolute px-1"
                style={{
                  left: `${(titleX / OUTPUT_W) * 100}%`,
                  top: `${(titleY / OUTPUT_H) * 100}%`,
                  transform: alignTransform(customization.titleAlign, 'top'),
                  textAlign: customization.titleAlign,
                  fontFamily: customization.titleFontName,
                  fontSize: `${customization.titleFontSize * scale}px`,
                  fontWeight: customization.titleBold ? 700 : 400,
                  color: `#${customization.titleColor}`,
                  lineHeight: 1.1,
                  whiteSpace: 'nowrap',
                }}
              >
                {titleLines.map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
              </div>
            )}

            {customization.channelEnabled && customization.channelText.trim() && (
              <div
                className="absolute px-1"
                style={{
                  left: `${(customization.channelX / OUTPUT_W) * 100}%`,
                  top: `${(customization.channelY / OUTPUT_H) * 100}%`,
                  transform: alignTransform(customization.channelAlign, 'bottom'),
                  textAlign: customization.channelAlign,
                  fontFamily: customization.channelFontName,
                  fontSize: `${customization.channelFontSize * scale}px`,
                  fontWeight: customization.channelBold ? 700 : 400,
                  color: `#${customization.channelColor}`,
                  whiteSpace: 'nowrap',
                }}
              >
                {customization.channelText}
              </div>
            )}
          </>
        ) : (
          <>
            {/* 영상 (세로 크롭) */}
            <video ref={videoRef} src={videoSrc} className="absolute inset-0 w-full h-full object-cover" preload={isVisible ? 'metadata' : 'none'} muted playsInline />

            {/* 상단 제목 */}
            {title && (
              <div
                className="absolute px-1"
                style={{
                  left: `${(titleX / OUTPUT_W) * 100}%`,
                  top: `${(titleY / OUTPUT_H) * 100}%`,
                  transform: alignTransform(customization.titleAlign, 'top'),
                  textAlign: customization.titleAlign,
                  fontFamily: customization.titleFontName,
                  fontSize: `${customization.titleFontSize * scale}px`,
                  fontWeight: customization.titleBold ? 700 : 400,
                  color: `#${customization.titleColor}`,
                  lineHeight: 1.1,
                  whiteSpace: 'nowrap',
                  textShadow: '0 2px 6px rgba(0,0,0,0.85)',
                }}
              >
                {titleLines.map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
              </div>
            )}

            {/* 말자막 인디케이터 (활성화된 경우만) */}
            {customization.subtitleEnabled && (
              <SubtitleIndicator customization={customization} scale={scale} label="자막" />
            )}
          </>
        )}
      </div>

      {/* 카드 정보 */}
      <div className="px-1 mt-2">
        <p className="text-white text-xs font-medium line-clamp-2 leading-tight">
          {title || '(제목 없음)'}
        </p>
        <p className="text-gray-500 text-[10px] mt-0.5 font-mono">
          {formatTime(startTime)} – {formatTime(endTime)}
        </p>
      </div>
    </div>
  );
}
