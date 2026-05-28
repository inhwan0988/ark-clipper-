'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { ClipCustomization } from './clip-customizer';
import { SubtitleIndicator, getCurrentSubtitleLine, smartSplitKoreanSubtitle, maxCharsForFontSize } from './subtitle-indicator';
import type { Transcript } from '@/types';

interface ClipTimelineEditorProps {
  videoSrc: string;
  duration: number;
  startTime: number;
  endTime: number;
  title: string;
  hashtags?: string[];
  layout?: 'letterbox' | 'crop_vertical' | 'custom_background';  // per-clip 오버라이드
  transcript?: Transcript | null;          // 말자막 미리보기용

  // 저장 버튼 누를 때 한번에 호출 (draft → committed)
  onSave: (changes: {
    startTime: number;
    endTime: number;
    title: string;
    hashtags: string[];
    layout: 'letterbox' | 'crop_vertical' | 'custom_background';
  }) => void;

  // AI 원본으로 되돌리기
  onRevert?: () => void;

  customization: ClipCustomization;
  onCustomizationChange: (c: ClipCustomization) => void;
}

const MIN_CLIP_LENGTH = 1;
const MAX_CLIP_LENGTH = 600; // 10분 (수동 편집 자유도 확보)

const FONTS = [
  { name: 'Standard', label: '스탠다드 (Arial)' },
  { name: 'Pretendard', label: 'Pretendard' },
  { name: 'Malgun Gothic', label: '맑은 고딕' },
  { name: 'Nanum Gothic', label: '나눔고딕' },
  { name: 'Nanum Square', label: '나눔스퀘어' },
  { name: 'Hancom Gothic', label: '한컴고딕' },
  { name: 'Yes24', label: 'YES24 고딕' },
  { name: 'Gulim', label: '굴림' },
];

/**
 * align + 위치(top/bottom)에 따라 CSS transform 반환
 * ASS의 \an 정렬 코드와 일치하도록 변환:
 *  - top + left:    transform = none (좌상단)
 *  - top + center:  translateX(-50%)
 *  - top + right:   translateX(-100%)
 *  - bottom + left: translateY(-100%)
 *  - bottom + center: translate(-50%, -100%)
 *  - bottom + right: translate(-100%, -100%)
 */
/**
 * 제목 2줄 분할.
 * - 짧은 제목(≤maxChars): [제목]
 * - 보통(≤2*maxChars): 자연스럽게 2줄 분할
 * - 긴 제목(>2*maxChars): 2줄로 강제 + 마지막에 "…"로 절약
 */
function splitKoreanLines(text: string, maxChars: number): string[] {
  if (!text) return [];
  const t = text.trim();
  if (t.length <= maxChars) return [t];

  // 첫 줄: maxChars 이내에서 공백 우선 분리
  let firstBreak = t.lastIndexOf(' ', maxChars);
  if (firstBreak <= maxChars / 2) firstBreak = maxChars;
  const line1 = t.slice(0, firstBreak).trim();
  let line2 = t.slice(firstBreak).trim();

  // 두 번째 줄이 maxChars를 초과하면 절약 표시
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

// FFmpeg 좌표계 (1080x1920 기준) - ShortsPreview에서 비율로 환산
const OUTPUT_W = 1080;
const OUTPUT_H = 1920;
const VIDEO_Y = 600; // 영상 시작 Y
const VIDEO_H_16_9 = 608; // 16:9 영상 높이
const TITLE_Y_LINE1 = 180;
const TITLE_LINE_GAP = 140;
const CHANNEL_BOTTOM_MARGIN = 80; // 하단 여백

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.floor((s % 1) * 10);
  return `${m}:${sec.toString().padStart(2, '0')}.${ms}`;
}


export function ClipTimelineEditor({
  videoSrc, duration,
  startTime: propStartTime, endTime: propEndTime,
  title: propTitle,
  hashtags: propHashtags,
  layout: propLayout,
  transcript,
  onSave,
  onRevert,
  customization, onCustomizationChange,
}: ClipTimelineEditorProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewWrapRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  // === Draft 상태 (저장 누르기 전 임시 변경) ===
  const [draftStartTime, setDraftStartTime] = useState(propStartTime);
  const [draftEndTime, setDraftEndTime] = useState(propEndTime);
  const [draftTitle, setDraftTitle] = useState(propTitle);
  const [draftHashtags, setDraftHashtags] = useState<string[]>(propHashtags || []);
  const [draftLayout, setDraftLayout] = useState<'letterbox' | 'crop_vertical' | 'custom_background'>(propLayout || customization.layout);

  // props 변경 시 draft 리셋 (다른 hook으로 포커스 변경, 되돌리기 등)
  // hashtags/layout도 deps에 포함해야 되돌리기 동작 시 모두 reset됨
  useEffect(() => {
    setDraftStartTime(propStartTime);
    setDraftEndTime(propEndTime);
    setDraftTitle(propTitle);
    setDraftHashtags(propHashtags || []);
    setDraftLayout(propLayout || customization.layout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propStartTime, propEndTime, propTitle, propHashtags, propLayout]);

  // 편의용 변수: 컴포넌트 내부에서는 항상 draft 사용
  const startTime = draftStartTime;
  const endTime = draftEndTime;
  const title = draftTitle;
  const hashtags = draftHashtags;
  const effectiveLayout = draftLayout;

  // draft가 props와 다르면 미저장 상태
  const isDirty =
    draftStartTime !== propStartTime ||
    draftEndTime !== propEndTime ||
    draftTitle !== propTitle ||
    JSON.stringify(draftHashtags) !== JSON.stringify(propHashtags || []) ||
    draftLayout !== (propLayout || customization.layout);

  function onTimeChange(s: number, e: number) {
    setDraftStartTime(s);
    setDraftEndTime(e);
  }
  function onTitleChange(t: string) { setDraftTitle(t); }
  function onHashtagsChange(tags: string[]) { setDraftHashtags(tags); }

  function handleSave() {
    onSave({
      startTime: draftStartTime,
      endTime: draftEndTime,
      title: draftTitle,
      hashtags: draftHashtags,
      layout: draftLayout,
    });
  }
  function handleReset() {
    setDraftStartTime(propStartTime);
    setDraftEndTime(propEndTime);
    setDraftTitle(propTitle);
    setDraftHashtags(propHashtags || []);
    setDraftLayout(propLayout || customization.layout);
  }

  const [currentTime, setCurrentTime] = useState(propStartTime);
  const [playing, setPlaying] = useState(false);
  const [dragging, setDragging] = useState<'start' | 'end' | 'cursor' | null>(null);
  const [textDragging, setTextDragging] = useState<'title' | 'channel' | null>(null);
  const [previewWidth, setPreviewWidth] = useState(320);
  const [hashtagInput, setHashtagInput] = useState('');
  const [showGuides, setShowGuides] = useState(true);
  const [guideMode, setGuideMode] = useState<'safe' | 'crosshair' | 'thirds'>('safe');

  // 타임라인 줌
  const [pixelsPerSecond, setPixelsPerSecond] = useState(20);
  const scrollWrapRef = useRef<HTMLDivElement>(null);

  function updateCust(patch: Partial<ClipCustomization>) {
    onCustomizationChange({ ...customization, ...patch });
  }

  // 레이아웃별 제목 위치 헬퍼 (titleX/Y는 letterbox용, titleXCrop/YCrop은 crop_vertical용)
  const titleX = effectiveLayout === 'crop_vertical' ? customization.titleXCrop : customization.titleX;
  const titleY = effectiveLayout === 'crop_vertical' ? customization.titleYCrop : customization.titleY;

  function setTitlePosition(x: number, y: number) {
    if (effectiveLayout === 'crop_vertical') {
      onCustomizationChange({ ...customization, titleXCrop: x, titleYCrop: y });
    } else {
      onCustomizationChange({ ...customization, titleX: x, titleY: y });
    }
  }

  // 해시태그 추가
  function addHashtag() {
    const tag = hashtagInput.trim().replace(/^#+/, '');
    if (!tag) return;
    const current = hashtags || [];
    if (current.includes(tag)) return;
    onHashtagsChange([...current, tag]);
    setHashtagInput('');
  }
  function removeHashtag(i: number) {
    if (!hashtags) return;
    onHashtagsChange(hashtags.filter((_, idx) => idx !== i));
  }

  // 텍스트 드래그 처리
  const handleTextDrag = useCallback((e: MouseEvent) => {
    if (!textDragging || !previewWrapRef.current) return;
    const rect = previewWrapRef.current.getBoundingClientRect();
    // 미리보기 좌표 → 1080x1920 좌표
    const x = ((e.clientX - rect.left) / rect.width) * OUTPUT_W;
    const y = ((e.clientY - rect.top) / rect.height) * OUTPUT_H;
    const clampedX = Math.max(0, Math.min(OUTPUT_W, x));
    const clampedY = Math.max(0, Math.min(OUTPUT_H, y));

    if (textDragging === 'title') {
      setTitlePosition(Math.round(clampedX), Math.round(clampedY));
    } else {
      onCustomizationChange({ ...customization, channelX: Math.round(clampedX), channelY: Math.round(clampedY) });
    }
  }, [textDragging, customization, onCustomizationChange]);

  useEffect(() => {
    if (!textDragging) return;
    const onMove = (e: MouseEvent) => { e.preventDefault(); handleTextDrag(e); };
    const onUp = () => setTextDragging(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [textDragging, handleTextDrag]);

  function resetTitlePosition() {
    if (effectiveLayout === 'crop_vertical') {
      onCustomizationChange({ ...customization, titleXCrop: 540, titleYCrop: 200 });
    } else {
      onCustomizationChange({ ...customization, titleX: 540, titleY: 180 });
    }
  }
  function resetChannelPosition() {
    onCustomizationChange({ ...customization, channelX: 540, channelY: 1840 });
  }
  // 가로 중앙 정렬: X만 화면 가운데(540)로, Y는 현재 위치 유지
  function centerTitle() {
    if (effectiveLayout === 'crop_vertical') {
      onCustomizationChange({ ...customization, titleXCrop: 540 });
    } else {
      onCustomizationChange({ ...customization, titleX: 540 });
    }
  }
  function centerChannel() {
    onCustomizationChange({ ...customization, channelX: 540 });
  }

  // 미리보기 width 측정 (반응형 스케일링)
  useEffect(() => {
    const el = previewWrapRef.current;
    if (!el) return;
    const update = () => setPreviewWidth(el.offsetWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 클립 시작 위치로 이동
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.currentTime = startTime;
      setCurrentTime(startTime);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const onTimeUpdate = () => {
      setCurrentTime(v.currentTime);
      if (v.currentTime >= endTime) {
        v.pause();
        setPlaying(false);
        v.currentTime = startTime;
      }
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);

    v.addEventListener('timeupdate', onTimeUpdate);
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    return () => {
      v.removeEventListener('timeupdate', onTimeUpdate);
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
    };
  }, [startTime, endTime]);

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      if (v.currentTime < startTime || v.currentTime >= endTime) {
        v.currentTime = startTime;
      }
      v.play();
    } else {
      v.pause();
    }
  }

  function seek(time: number) {
    const v = videoRef.current;
    if (!v) return;
    const clamped = Math.max(0, Math.min(duration, time));
    v.currentTime = clamped;
    setCurrentTime(clamped);
  }

  const handleTimelineEvent = useCallback((e: React.MouseEvent<HTMLDivElement> | MouseEvent, mode: 'start' | 'end' | 'cursor') => {
    const tl = timelineRef.current;
    if (!tl) return;
    const rect = tl.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const time = ratio * duration;

    if (mode === 'start') {
      const newStart = Math.min(time, endTime - MIN_CLIP_LENGTH);
      const clamped = Math.max(0, Math.min(newStart, endTime - MIN_CLIP_LENGTH));
      onTimeChange(clamped, endTime);
      seek(clamped);
    } else if (mode === 'end') {
      const newEnd = Math.max(time, startTime + MIN_CLIP_LENGTH);
      const clamped = Math.min(duration, Math.max(newEnd, startTime + MIN_CLIP_LENGTH));
      const finalEnd = Math.min(clamped, startTime + MAX_CLIP_LENGTH);
      onTimeChange(startTime, finalEnd);
      seek(finalEnd);
    } else {
      seek(time);
    }
  }, [duration, startTime, endTime, onTimeChange]);

  // 재생 커서가 보이는 영역에서 벗어나면 자동 스크롤
  useEffect(() => {
    const sw = scrollWrapRef.current;
    if (!sw || dragging) return;
    const cursorPx = currentTime * pixelsPerSecond;
    const visibleLeft = sw.scrollLeft;
    const visibleRight = sw.scrollLeft + sw.clientWidth;
    const margin = 40;
    if (cursorPx < visibleLeft + margin) {
      sw.scrollTo({ left: Math.max(0, cursorPx - margin), behavior: 'smooth' });
    } else if (cursorPx > visibleRight - margin) {
      sw.scrollTo({ left: cursorPx - sw.clientWidth + margin, behavior: 'smooth' });
    }
  }, [currentTime, pixelsPerSecond, dragging]);

  function zoomIn() {
    setPixelsPerSecond((p) => Math.min(p * 1.5, 200));
  }
  function zoomOut() {
    setPixelsPerSecond((p) => Math.max(p / 1.5, 1));
  }
  function zoomFit() {
    const sw = scrollWrapRef.current;
    if (!sw || !duration) return;
    setPixelsPerSecond(sw.clientWidth / duration);
  }
  function zoomToClip() {
    const sw = scrollWrapRef.current;
    if (!sw) return;
    const len = endTime - startTime;
    if (len <= 0) return;
    // 클립 + 양쪽 여유
    const target = sw.clientWidth / (len * 1.4);
    setPixelsPerSecond(Math.max(target, 5));
    // 클립 시작점이 보이도록 스크롤
    setTimeout(() => {
      if (sw) sw.scrollTo({ left: Math.max(0, startTime * target - 40), behavior: 'smooth' });
    }, 50);
  }

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => handleTimelineEvent(e, dragging);
    const onUp = () => setDragging(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging, handleTimelineEvent]);

  function setCurrentAsStart() {
    const newStart = Math.min(currentTime, endTime - MIN_CLIP_LENGTH);
    onTimeChange(Math.max(0, newStart), endTime);
  }
  function setCurrentAsEnd() {
    const newEnd = Math.max(currentTime, startTime + MIN_CLIP_LENGTH);
    onTimeChange(startTime, Math.min(duration, Math.min(newEnd, startTime + MAX_CLIP_LENGTH)));
  }

  function adjustStart(delta: number) {
    const v = startTime + delta;
    const clamped = Math.max(0, Math.min(v, endTime - MIN_CLIP_LENGTH));
    onTimeChange(clamped, endTime);
  }
  function adjustEnd(delta: number) {
    const v = endTime + delta;
    const clamped = Math.min(duration, Math.max(v, startTime + MIN_CLIP_LENGTH));
    onTimeChange(startTime, Math.min(clamped, startTime + MAX_CLIP_LENGTH));
  }

  const clipLength = endTime - startTime;

  // 9:16 미리보기 스케일 (1080 → previewWidth)
  const scale = previewWidth / OUTPUT_W;
  // 제목: 13자 기준으로 자동 분할. 길면 줄 수 늘림 (잘리지 않음)
  const titleLines = splitKoreanLines(title, 13);

  return (
    <div className="bg-[#0a1428] rounded-xl border border-[#1a2d4d] overflow-hidden">
      {/* 제목 편집 + 해시태그 */}
      <div className="px-4 py-3 border-b border-[#1a2d4d] bg-[#0a1428] space-y-3">
        <div>
          <label className="block text-gray-500 text-xs mb-1.5">영상 제목 (상단에 표시됨)</label>
          <input
            type="text"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="쇼츠 제목을 입력하세요"
            className="w-full px-3 py-2 bg-[#0a1428] border border-[#243a5c] rounded text-white text-base font-medium focus:outline-none focus:border-[#4988C4]"
          />
        </div>

        {true && (
          <div>
            <label className="block text-gray-500 text-xs mb-1.5">추천 해시태그 (Enter 또는 쉼표로 추가)</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {(hashtags || []).map((tag, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#4988C4]/15 border border-[#4988C4]/30 text-[#4988C4] rounded text-xs">
                  #{tag}
                  <button
                    onClick={() => removeHashtag(i)}
                    className="text-[#4988C4] hover:text-red-400 ml-0.5"
                    aria-label="태그 삭제"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={hashtagInput}
                onChange={(e) => {
                  const v = e.target.value;
                  // 쉼표 입력 시 자동 추가
                  if (v.includes(',')) {
                    const parts = v.split(',').map(p => p.trim().replace(/^#+/, '')).filter(Boolean);
                    if (parts.length) {
                      const current = hashtags || [];
                      const newTags = parts.filter(p => !current.includes(p));
                      onHashtagsChange([...current, ...newTags]);
                    }
                    setHashtagInput('');
                  } else {
                    setHashtagInput(v);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addHashtag();
                  }
                }}
                placeholder="#태그입력"
                className="flex-1 px-3 py-1.5 bg-[#0a1428] border border-[#243a5c] rounded text-white text-sm focus:outline-none focus:border-[#4988C4]"
              />
              <button
                onClick={addHashtag}
                disabled={!hashtagInput.trim()}
                className="px-3 py-1.5 bg-[#1C4D8D] text-white rounded text-sm hover:bg-[#0F2854] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                추가
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 9:16 미리보기 + 클립 세부수정 (좌측) | 스타일 설정 (우측) */}
      <div className="grid grid-cols-1 md:grid-cols-[420px_1fr] gap-4 p-4 bg-[#0a1428] items-start">
        {/* 좌측: 미리보기 + 클립 세부수정 */}
        <div className="flex flex-col items-center md:sticky md:top-4 w-[420px]">
          {/* 미리보기 헤더 + 가이드 토글 */}
          <div className="w-full flex items-center justify-between mb-1.5">
            <span className="text-gray-500 text-[10px] uppercase tracking-wider">9:16 미리보기</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowGuides(!showGuides)}
                className={`px-1.5 py-0.5 rounded text-[10px] border transition-colors ${
                  showGuides ? 'border-[#4988C4] bg-[#4988C4]/10 text-[#4988C4]' : 'border-[#243a5c] bg-[#11203d] text-gray-600'
                }`}
                title="규격 라인 표시"
              >
                가이드
              </button>
              {showGuides && (
                <div className="flex bg-[#11203d] border border-[#243a5c] rounded p-0.5">
                  <button
                    onClick={() => setGuideMode('safe')}
                    className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${guideMode === 'safe' ? 'bg-[#1C4D8D] text-white' : 'text-gray-600 hover:text-white'}`}
                    title="세이프 영역"
                  >
                    세이프
                  </button>
                  <button
                    onClick={() => setGuideMode('crosshair')}
                    className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${guideMode === 'crosshair' ? 'bg-[#1C4D8D] text-white' : 'text-gray-600 hover:text-white'}`}
                    title="중앙 십자선"
                  >
                    중앙
                  </button>
                  <button
                    onClick={() => setGuideMode('thirds')}
                    className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${guideMode === 'thirds' ? 'bg-[#1C4D8D] text-white' : 'text-gray-600 hover:text-white'}`}
                    title="삼분할"
                  >
                    삼분할
                  </button>
                </div>
              )}
            </div>
          </div>
          <div
            ref={previewWrapRef}
            className="relative bg-[#0a1428] overflow-hidden mx-auto ring-2 ring-white shadow-2xl"
            style={{ width: '420px', aspectRatio: '9/16' }}
          >
            {effectiveLayout === 'letterbox' ? (
              <>
                {/* 영상 (16:9 letterbox) */}
                <div
                  className="absolute left-0 right-0 bg-[#0a1428]"
                  style={{
                    top: `${(VIDEO_Y / OUTPUT_H) * 100}%`,
                    height: `${(VIDEO_H_16_9 / OUTPUT_H) * 100}%`,
                  }}
                >
                  <video ref={videoRef} src={videoSrc} className="w-full h-full object-contain" preload="metadata" />
                </div>

                {/* 상단 제목 - 드래그 가능 + 정렬 적용 */}
                {title && (
                  <div
                    onMouseDown={(e) => { e.preventDefault(); setTextDragging('title'); }}
                    className={`absolute px-1 cursor-move select-none transition-all ${
                      textDragging === 'title' ? 'ring-1 ring-blue-400 ring-offset-1 ring-offset-black/50' : 'hover:ring-1 hover:ring-blue-400/50'
                    }`}
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

                {/* 하단 채널명 - 드래그 가능 + 정렬 적용 */}
                {customization.channelEnabled && customization.channelText.trim() && (
                  <div
                    onMouseDown={(e) => { e.preventDefault(); setTextDragging('channel'); }}
                    className={`absolute px-1 cursor-move select-none transition-all ${
                      textDragging === 'channel' ? 'ring-1 ring-blue-400 ring-offset-1 ring-offset-black/50' : 'hover:ring-1 hover:ring-blue-400/50'
                    }`}
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
                {/* 영상 (세로 크롭, 9:16 가득 채움) */}
                <video ref={videoRef} src={videoSrc} className="absolute inset-0 w-full h-full object-cover" preload="metadata" />

                {/* 상단 제목 - 세로 크롭에서도 표시 */}
                {title && (
                  <div
                    onMouseDown={(e) => { e.preventDefault(); setTextDragging('title'); }}
                    className={`absolute px-1 cursor-move select-none transition-all ${
                      textDragging === 'title' ? 'ring-1 ring-blue-400 ring-offset-1 ring-offset-black/50' : 'hover:ring-1 hover:ring-blue-400/50'
                    }`}
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
                      textShadow: '0 2px 8px rgba(0,0,0,0.8)',
                    }}
                  >
                    {titleLines.map((line, i) => (
                      <div key={i}>{line}</div>
                    ))}
                  </div>
                )}

                {/* 말자막 미리보기: 폰트 크기 기반 동적 글자수, 한 줄씩 순차 표시 */}
                {customization.subtitleEnabled && (() => {
                  const dynMax = maxCharsForFontSize(customization.subtitleFontSize);
                  let label = '여러분 안녕하세요 오늘은 흥미로운 영상을 준비했습니다';
                  if (transcript && transcript.segments.length > 0) {
                    const seg = transcript.segments.find(
                      (s) => currentTime >= s.start && currentTime < s.end
                    );
                    if (seg) {
                      label = getCurrentSubtitleLine(seg.start, seg.end, seg.text, currentTime, dynMax);
                    } else {
                      const next = transcript.segments.find((s) => s.start >= currentTime);
                      if (next) {
                        const firstLine = smartSplitKoreanSubtitle(next.text, dynMax)[0];
                        if (firstLine) label = firstLine;
                      } else {
                        // placeholder도 폰트에 맞게 첫 줄만
                        const firstLine = smartSplitKoreanSubtitle(label, dynMax)[0];
                        if (firstLine) label = firstLine;
                      }
                    }
                  } else {
                    const firstLine = smartSplitKoreanSubtitle(label, dynMax)[0];
                    if (firstLine) label = firstLine;
                  }
                  return (
                    <SubtitleIndicator
                      customization={customization}
                      scale={scale}
                      label={label}
                    />
                  );
                })()}
              </>
            )}

            {/* 규격 가이드 라인 (프리미어 프로 스타일) */}
            {showGuides && (
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none"
                viewBox="0 0 1080 1920"
                preserveAspectRatio="none"
              >
                {/* 외곽 테두리 (기본 표시) */}
                <rect x="0" y="0" width="1080" height="1920" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2" />

                {guideMode === 'thirds' && (
                  <g stroke="rgba(255,255,0,0.55)" strokeWidth="1.5" strokeDasharray="6,6">
                    {/* 세로 삼분선 */}
                    <line x1="360" y1="0" x2="360" y2="1920" />
                    <line x1="720" y1="0" x2="720" y2="1920" />
                    {/* 가로 삼분선 */}
                    <line x1="0" y1="640" x2="1080" y2="640" />
                    <line x1="0" y1="1280" x2="1080" y2="1280" />
                  </g>
                )}

                {guideMode === 'safe' && (
                  <g fill="none">
                    {/* 액션 세이프 (90%) */}
                    <rect x="54" y="96" width="972" height="1728" stroke="rgba(0,255,255,0.6)" strokeWidth="1.5" strokeDasharray="8,4" />
                    {/* 타이틀 세이프 (80%) */}
                    <rect x="108" y="192" width="864" height="1536" stroke="rgba(255,255,0,0.6)" strokeWidth="1.5" strokeDasharray="8,4" />
                  </g>
                )}

                {guideMode === 'crosshair' && (
                  <g stroke="rgba(255,255,255,0.5)" strokeWidth="1.5">
                    {/* 중앙 가로선 */}
                    <line x1="0" y1="960" x2="1080" y2="960" strokeDasharray="6,6" />
                    {/* 중앙 세로선 */}
                    <line x1="540" y1="0" x2="540" y2="1920" strokeDasharray="6,6" />
                    {/* 정중앙 점 */}
                    <circle cx="540" cy="960" r="8" fill="rgba(255,255,255,0.9)" stroke="none" />
                    <circle cx="540" cy="960" r="20" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" />
                  </g>
                )}

                {/* 영상 영역 표시 (letterbox일 때) */}
                {effectiveLayout === 'letterbox' && (
                  <rect
                    x="0"
                    y="600"
                    width="1080"
                    height="608"
                    fill="none"
                    stroke="rgba(96,165,250,0.5)"
                    strokeWidth="1.5"
                    strokeDasharray="4,4"
                  />
                )}
              </svg>
            )}
          </div>

          {/* 클립 세부수정 (영상 하단, 미리보기와 동일 폭) */}
          <div className="w-[420px] mt-3 space-y-3">
            <div className="text-gray-500 text-[10px] uppercase tracking-wider">
              클립 세부수정
            </div>
            <div className="flex items-center justify-between text-xs">
              <div className="flex flex-wrap gap-3 text-gray-600">
                <span>현재: <span className="text-white font-mono">{formatTime(currentTime)}</span></span>
                <span>길이: <span className={`font-mono ${clipLength > 90 ? 'text-orange-400' : 'text-[#4988C4]'}`}>{clipLength.toFixed(1)}초</span></span>
              </div>
              <span className="text-gray-500 font-mono">{formatTime(duration)}</span>
            </div>

          {/* 줌 컨트롤 (슬라이더) */}
          <div className="flex items-center gap-2 text-xs">
            <button onClick={zoomOut} className="w-6 h-6 bg-[#11203d] border border-[#243a5c] text-gray-300 rounded hover:bg-[#1a2d4d] flex items-center justify-center flex-shrink-0" title="축소">−</button>
            {/* log 스케일 슬라이더: 1 ~ 200 px/sec */}
            <input
              type="range"
              min={0}
              max={1000}
              step={1}
              value={Math.round((Math.log(pixelsPerSecond) / Math.log(200)) * 1000)}
              onChange={(e) => {
                const v = parseInt(e.target.value);
                const pps = Math.pow(200, v / 1000);
                setPixelsPerSecond(Math.max(0.5, Math.min(200, pps)));
              }}
              className="flex-1 accent-[#4988C4] cursor-pointer"
              title="줌 (드래그로 조정, 마우스 휠로도 가능)"
            />
            <button onClick={zoomIn} className="w-6 h-6 bg-[#11203d] border border-[#243a5c] text-gray-300 rounded hover:bg-[#1a2d4d] flex items-center justify-center flex-shrink-0" title="확대">＋</button>
            <button onClick={zoomToClip} className="px-2 py-1 bg-[#11203d] border border-[#243a5c] text-gray-300 rounded hover:bg-[#1a2d4d] flex-shrink-0" title="선택된 클립에 맞춤">클립</button>
            <button onClick={zoomFit} className="px-2 py-1 bg-[#11203d] border border-[#243a5c] text-gray-300 rounded hover:bg-[#1a2d4d] flex-shrink-0" title="전체 영상 보기">전체</button>
          </div>
          <div className="flex justify-between text-[10px] text-gray-500">
            <span>줌: {pixelsPerSecond.toFixed(1)} px/초</span>
            <span>표시: {(420 / pixelsPerSecond).toFixed(1)}초</span>
          </div>

          {/* 타임라인 (가로 스크롤 + 마우스 휠 줌) */}
          <div
            ref={scrollWrapRef}
            className="overflow-x-auto overflow-y-hidden scrollbar-thin"
            onWheel={(e) => {
              // Ctrl/Cmd + 휠 → 줌 (방지: 페이지 줌)
              // 일반 휠 → 가로 스크롤 (브라우저 기본 동작 사용)
              // Shift 없이 세로 휠도 가로로 변환
              if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
                setPixelsPerSecond((p) => Math.max(0.5, Math.min(200, p * factor)));
              } else if (e.deltaY !== 0 && !e.shiftKey) {
                // 세로 휠을 가로 스크롤로
                const sw = scrollWrapRef.current;
                if (sw) {
                  e.preventDefault();
                  sw.scrollLeft += e.deltaY;
                }
              }
            }}
          >
            <div
              ref={timelineRef}
              className="relative h-12 bg-[#11203d] rounded select-none cursor-pointer"
              style={{ width: `${Math.max(420, duration * pixelsPerSecond)}px` }}
              onClick={(e) => { if (!dragging) handleTimelineEvent(e, 'cursor'); }}
            >
              <div
                className="absolute top-0 bottom-0 bg-[#4988C4]/30 border-y-2 border-[#4988C4]"
                style={{ left: `${startTime * pixelsPerSecond}px`, width: `${(endTime - startTime) * pixelsPerSecond}px` }}
              />
              <div
                onMouseDown={(e) => { e.stopPropagation(); setDragging('start'); }}
                className="absolute top-0 bottom-0 w-3 -ml-1.5 bg-blue-400 hover:bg-blue-300 cursor-ew-resize rounded flex items-center justify-center z-10"
                style={{ left: `${startTime * pixelsPerSecond}px` }}
                title="시작점"
              >
                <div className="w-0.5 h-6 bg-[#0a1428]" />
              </div>
              <div
                onMouseDown={(e) => { e.stopPropagation(); setDragging('end'); }}
                className="absolute top-0 bottom-0 w-3 -ml-1.5 bg-blue-400 hover:bg-blue-300 cursor-ew-resize rounded flex items-center justify-center z-10"
                style={{ left: `${endTime * pixelsPerSecond}px` }}
                title="끝점"
              >
                <div className="w-0.5 h-6 bg-[#0a1428]" />
              </div>
              {/* 재생 커서 - 드래그 가능 */}
              <div
                onMouseDown={(e) => { e.stopPropagation(); setDragging('cursor'); }}
                className="absolute top-0 bottom-0 w-3 -ml-1.5 cursor-ew-resize z-20 flex items-center justify-center"
                style={{ left: `${currentTime * pixelsPerSecond}px` }}
                title="드래그로 위치 이동"
              >
                <div className="w-0.5 h-full bg-red-500" />
                <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-4 h-4 bg-red-500 rounded-full hover:bg-red-400 hover:scale-125 transition-transform" />
              </div>
            </div>
          </div>

          <div className="flex justify-between text-xs">
            <span className="text-gray-600">시작: <span className="text-white font-mono">{formatTime(startTime)}</span></span>
            <span className="text-gray-600">끝: <span className="text-white font-mono">{formatTime(endTime)}</span></span>
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            <button onClick={togglePlay} className="px-3 py-1.5 bg-[#1C4D8D] text-white rounded text-sm hover:bg-[#0F2854] flex items-center gap-1">
              {playing ? (
                <><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6zM14 4h4v16h-4z" /></svg>일시정지</>
              ) : (
                <><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>재생</>
              )}
            </button>
            <div className="flex gap-1 ml-2">
              <button onClick={() => seek(currentTime - 1)} className="px-2 py-1.5 bg-[#11203d] border border-[#243a5c] text-gray-300 rounded text-xs hover:bg-[#1a2d4d]">-1초</button>
              <button onClick={() => seek(currentTime - 0.1)} className="px-2 py-1.5 bg-[#11203d] border border-[#243a5c] text-gray-300 rounded text-xs hover:bg-[#1a2d4d]">-0.1</button>
              <button onClick={() => seek(currentTime + 0.1)} className="px-2 py-1.5 bg-[#11203d] border border-[#243a5c] text-gray-300 rounded text-xs hover:bg-[#1a2d4d]">+0.1</button>
              <button onClick={() => seek(currentTime + 1)} className="px-2 py-1.5 bg-[#11203d] border border-[#243a5c] text-gray-300 rounded text-xs hover:bg-[#1a2d4d]">+1초</button>
            </div>
            <div className="ml-auto flex gap-1">
              <button onClick={setCurrentAsStart} className="px-3 py-1.5 bg-[#1C4D8D] text-white rounded text-xs hover:bg-[#0F2854]">⏪ 시작점</button>
              <button onClick={setCurrentAsEnd} className="px-3 py-1.5 bg-[#1C4D8D] text-white rounded text-xs hover:bg-[#0F2854]">끝점 ⏩</button>
            </div>
          </div>

            <div className="flex flex-wrap gap-2 items-center text-xs">
              <span className="text-gray-500">시작:</span>
              <button onClick={() => adjustStart(-0.5)} className="px-2 py-1 bg-[#11203d] border border-[#243a5c] text-gray-300 rounded hover:bg-[#1a2d4d]">-0.5</button>
              <button onClick={() => adjustStart(0.5)} className="px-2 py-1 bg-[#11203d] border border-[#243a5c] text-gray-300 rounded hover:bg-[#1a2d4d]">+0.5</button>
              <span className="text-gray-500 ml-2">끝:</span>
              <button onClick={() => adjustEnd(-0.5)} className="px-2 py-1 bg-[#11203d] border border-[#243a5c] text-gray-300 rounded hover:bg-[#1a2d4d]">-0.5</button>
              <button onClick={() => adjustEnd(0.5)} className="px-2 py-1 bg-[#11203d] border border-[#243a5c] text-gray-300 rounded hover:bg-[#1a2d4d]">+0.5</button>
            </div>
          </div>
        </div>

        {/* 우측: 스타일 설정 */}
        <div className="space-y-3 min-w-0">
            {/* 헤더 + 레이아웃: 좌측 상단 */}
            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
              <div className="flex-1">
                <div className="flex items-start justify-between mb-1 gap-2">
                  <h4 className="text-white text-sm font-semibold pt-1">
                    스타일 설정 <span className="text-gray-500 text-xs font-normal">(실시간 반영)</span>
                  </h4>
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex gap-1.5">
                      {onRevert && (
                        <button
                          onClick={onRevert}
                          className="px-2.5 py-1 bg-[#11203d] border border-[#243a5c] text-gray-600 rounded text-xs hover:bg-[#1a2d4d] transition-colors"
                          title="AI가 처음 추천한 원본으로 되돌리기"
                        >
                          🔄 되돌리기
                        </button>
                      )}
                      <button
                        onClick={handleReset}
                        disabled={!isDirty}
                        className="px-2.5 py-1 bg-[#11203d] border border-[#243a5c] text-gray-600 rounded text-xs hover:bg-[#1a2d4d] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        title="저장 전 변경사항 취소"
                      >
                        ↩️ 취소
                      </button>
                      <button
                        onClick={handleSave}
                        disabled={!isDirty}
                        className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                          isDirty
                            ? 'bg-[#1C4D8D] text-white hover:bg-[#0F2854]'
                            : 'bg-[#1a2d4d] text-gray-500 cursor-not-allowed'
                        }`}
                        title="이 클립의 변경사항 저장"
                      >
                        💾 저장
                      </button>
                    </div>
                    {isDirty && (
                      <span className="text-orange-400 text-[10px] font-medium">● 저장 안 됨</span>
                    )}
                  </div>
                </div>
                <label className="block text-gray-600 text-xs mb-1.5">레이아웃 <span className="text-gray-600">(이 클립에만 적용)</span></label>
                <div className="flex gap-2 w-fit">
                  <button
                    onClick={() => setDraftLayout('letterbox')}
                    className={`px-3 py-2 rounded-lg border text-left transition-colors ${
                      effectiveLayout === 'letterbox' ? 'border-[#4988C4] bg-[#4988C4]/10' : 'border-[#243a5c] bg-[#0a1428]'
                    }`}
                  >
                    <div className="text-white text-xs font-medium">레터박스</div>
                    <div className="text-gray-600 text-[10px]">원본 비율 유지</div>
                  </button>
                  <button
                    onClick={() => setDraftLayout('crop_vertical')}
                    className={`px-3 py-2 rounded-lg border text-left transition-colors ${
                      effectiveLayout === 'crop_vertical' ? 'border-[#4988C4] bg-[#4988C4]/10' : 'border-[#243a5c] bg-[#0a1428]'
                    }`}
                  >
                    <div className="text-white text-xs font-medium">세로 크롭</div>
                    <div className="text-gray-600 text-[10px]">9:16 잘라내기</div>
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {/* 상단 제목 - 두 레이아웃 모두 표시 */}
              <div className="space-y-2 border border-[#1a2d4d] rounded-lg p-3 bg-[#0a1428]">
                <h5 className="text-gray-300 text-xs font-medium">상단 제목</h5>
                <div>
                  <label className="block text-gray-600 text-xs mb-1">제목 내용</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => onTitleChange(e.target.value)}
                    placeholder="쇼츠 제목"
                    className="w-full px-3 py-2 bg-[#0a1428] border border-[#243a5c] rounded text-white text-sm focus:outline-none focus:border-[#4988C4]"
                  />
                </div>
                <Select label="글꼴" value={customization.titleFontName} onChange={(v) => updateCust({ titleFontName: v })} options={FONTS} />
                <Slider label="크기" value={customization.titleFontSize} min={48} max={120} step={4} onChange={(v) => updateCust({ titleFontSize: v })} unit="px" />
                <AlignToggle label="정렬" value={customization.titleAlign} onChange={(v) => updateCust({ titleAlign: v })} />
                <Toggle label="굵게" checked={customization.titleBold} onChange={(v) => updateCust({ titleBold: v })} />
                <ColorPicker label="색상" value={customization.titleColor} onChange={(v) => updateCust({ titleColor: v })} />
                <div>
                  <label className="block text-gray-600 text-xs mb-1">위치</label>
                  <div className="flex gap-1.5">
                    <button onClick={resetTitlePosition} className="flex-1 px-2 py-1 bg-[#0a1428] border border-[#243a5c] text-gray-300 rounded text-xs hover:bg-[#1a2d4d]" title="기본 위치 (상단 가운데)">
                      상단
                    </button>
                    <button onClick={centerTitle} className="flex-1 px-2 py-1 bg-[#0a1428] border border-[#243a5c] text-gray-300 rounded text-xs hover:bg-[#1a2d4d]" title="현재 Y 위치에서 가로 중앙으로">
                      가로 중앙
                    </button>
                  </div>
                </div>
              </div>

              {/* 하단 채널명 - 레터박스 전용 */}
              {effectiveLayout === 'letterbox' && (
                <div className="space-y-2 border border-[#1a2d4d] rounded-lg p-3 bg-[#0a1428]">
                  <h5 className="text-gray-300 text-xs font-medium">하단 채널명</h5>
                  <Toggle label="채널명 표시" checked={customization.channelEnabled} onChange={(v) => updateCust({ channelEnabled: v })} />
                  {customization.channelEnabled && (
                    <>
                      <div>
                        <label className="block text-gray-600 text-xs mb-1">채널명 (예: @MyChannel)</label>
                        <input
                          type="text"
                          value={customization.channelText}
                          onChange={(e) => updateCust({ channelText: e.target.value })}
                          placeholder="@MyChannel"
                          className="w-full px-3 py-2 bg-[#0a1428] border border-[#243a5c] rounded text-white text-sm focus:outline-none focus:border-[#4988C4]"
                        />
                      </div>
                      <Select label="글꼴" value={customization.channelFontName} onChange={(v) => updateCust({ channelFontName: v })} options={FONTS} />
                      <Slider label="크기" value={customization.channelFontSize} min={28} max={80} step={2} onChange={(v) => updateCust({ channelFontSize: v })} unit="px" />
                      <AlignToggle label="정렬" value={customization.channelAlign} onChange={(v) => updateCust({ channelAlign: v })} />
                      <Toggle label="굵게" checked={customization.channelBold} onChange={(v) => updateCust({ channelBold: v })} />
                      <ColorPicker label="색상" value={customization.channelColor} onChange={(v) => updateCust({ channelColor: v })} />
                      <div>
                        <label className="block text-gray-600 text-xs mb-1">위치</label>
                        <div className="flex gap-1.5">
                          <button onClick={centerChannel} className="flex-1 px-2 py-1 bg-[#0a1428] border border-[#243a5c] text-gray-300 rounded text-xs hover:bg-[#1a2d4d]" title="현재 Y 위치에서 가로 중앙으로">
                            가로 중앙
                          </button>
                          <button onClick={resetChannelPosition} className="flex-1 px-2 py-1 bg-[#0a1428] border border-[#243a5c] text-gray-300 rounded text-xs hover:bg-[#1a2d4d]" title="기본 위치 (하단 가운데)">
                            하단
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* 말자막 - 세로 크롭 전용 */}
              {effectiveLayout === 'crop_vertical' && (
                <div className="space-y-2 border border-[#1a2d4d] rounded-lg p-3 bg-[#0a1428]">
                  <h5 className="text-gray-300 text-xs font-medium flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" /></svg>
                    말자막 (음성 인식)
                  </h5>
                  <Toggle
                    label="말자막 표시"
                    checked={customization.subtitleEnabled}
                    onChange={(v) => updateCust({ subtitleEnabled: v })}
                  />
                  {customization.subtitleEnabled && (
                    <>
                      <Select label="글꼴" value={customization.subtitleFontName} onChange={(v) => updateCust({ subtitleFontName: v })} options={FONTS} />
                      <Slider label="크기" value={customization.subtitleFontSize} min={32} max={120} step={2} onChange={(v) => updateCust({ subtitleFontSize: v })} unit="px" />
                      <p className="text-gray-500 text-[10px] leading-relaxed">
                        💡 한 줄 최대 <span className="text-gray-300 font-medium">{maxCharsForFontSize(customization.subtitleFontSize)}자</span> (폰트 크기에 자동 맞춤). 단어/문장 중간 절대 안 잘리며 한 줄씩 순차로 흘러갑니다.
                      </p>
                      <Toggle label="굵게" checked={customization.subtitleBold} onChange={(v) => updateCust({ subtitleBold: v })} />
                      <ColorPicker label="글씨 색" value={customization.subtitleColor} onChange={(v) => updateCust({ subtitleColor: v })} />

                      {/* 외곽선 */}
                      <div className="border-t border-[#1a2d4d] pt-2 space-y-2">
                        <Toggle label="외곽선" checked={customization.subtitleOutlineEnabled} onChange={(v) => updateCust({ subtitleOutlineEnabled: v })} />
                        {customization.subtitleOutlineEnabled && (
                          <>
                            <ColorPicker label="외곽선 색" value={customization.subtitleOutlineColor} onChange={(v) => updateCust({ subtitleOutlineColor: v })} />
                            <Slider label="외곽선 두께" value={customization.subtitleOutlineWidth} min={1} max={10} step={1} onChange={(v) => updateCust({ subtitleOutlineWidth: v })} unit="px" />
                          </>
                        )}
                      </div>

                      {/* 배경 */}
                      <div className="border-t border-[#1a2d4d] pt-2 space-y-2">
                        <Toggle label="배경 사용" checked={customization.subtitleBgEnabled} onChange={(v) => updateCust({ subtitleBgEnabled: v })} />
                        {customization.subtitleBgEnabled && (
                          <>
                            <ColorPicker label="배경 색" value={customization.subtitleBgColor} onChange={(v) => updateCust({ subtitleBgColor: v })} />
                            <Slider label="배경 투명도" value={customization.subtitleBgOpacity} min={0} max={100} step={5} onChange={(v) => updateCust({ subtitleBgOpacity: v })} unit="%" />
                          </>
                        )}
                      </div>

                      {/* 위치 */}
                      <div className="border-t border-[#1a2d4d] pt-2">
                        <Slider label="자막 Y 위치" value={customization.subtitleY} min={1000} max={1880} step={10} onChange={(v) => updateCust({ subtitleY: v })} unit="" />
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
        </div>
      </div>
    </div>
  );
}

function AlignToggle({ label, value, onChange }: { label: string; value: 'left' | 'center' | 'right'; onChange: (v: 'left' | 'center' | 'right') => void }) {
  const opts: Array<{ id: 'left' | 'center' | 'right'; icon: React.ReactNode; title: string }> = [
    { id: 'left', title: '왼쪽 정렬', icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h10M4 18h14" /></svg>
    )},
    { id: 'center', title: '가운데 정렬', icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M7 12h10M5 18h14" /></svg>
    )},
    { id: 'right', title: '오른쪽 정렬', icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M10 12h10M6 18h14" /></svg>
    )},
  ];
  return (
    <div className="flex items-center justify-between">
      <label className="text-gray-600 text-xs">{label}</label>
      <div className="flex gap-1 bg-[#0a1428] border border-[#243a5c] rounded p-0.5">
        {opts.map((o) => (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            title={o.title}
            className={`p-1 rounded transition-colors ${
              value === o.id ? 'bg-[#1C4D8D] text-white' : 'text-gray-600 hover:text-white hover:bg-[#1a2d4d]'
            }`}
          >
            {o.icon}
          </button>
        ))}
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <label className="text-gray-600 text-xs">{label}</label>
      <button
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-6 rounded-full transition-colors ${checked ? 'bg-[#4988C4]' : 'bg-[#243a5c]'}`}
      >
        <div className={`absolute top-0.5 w-5 h-5 bg-[#0a1428] rounded-full transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </button>
    </div>
  );
}

function Slider({ label, value, min, max, step, onChange, unit }: {
  label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; unit?: string;
}) {
  return (
    <div>
      <label className="flex justify-between items-center text-gray-600 text-xs mb-1">
        <span>{label}</span>
        <span className="text-white">{value}{unit}</span>
      </label>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseInt(e.target.value))} className="w-full accent-[#4988C4]" />
    </div>
  );
}

function Select({ label, value, options, onChange }: {
  label: string; value: string; options: { name: string; label: string }[]; onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-gray-600 text-xs mb-1">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full px-3 py-2 bg-[#0a1428] border border-[#243a5c] rounded text-white text-sm focus:outline-none focus:border-[#4988C4]">
        {options.map((o) => <option key={o.name} value={o.name}>{o.label}</option>)}
      </select>
    </div>
  );
}

function ColorPicker({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  function handleHexInput(input: string) {
    const cleaned = input.replace(/[^0-9a-fA-F]/g, '').slice(0, 6).toUpperCase();
    if (cleaned.length === 6) onChange(cleaned);
  }

  return (
    <div className="flex justify-between items-center">
      <label className="text-gray-600 text-xs">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={`#${value}`}
          onChange={(e) => onChange(e.target.value.replace('#', '').toUpperCase())}
          className="w-9 h-9 rounded border border-[#243a5c] bg-transparent cursor-pointer"
          title="컬러 휠로 선택"
        />
        <span className="text-gray-500 text-xs font-mono">#</span>
        <input
          type="text"
          value={value}
          onChange={(e) => handleHexInput(e.target.value)}
          maxLength={6}
          className="w-20 px-2 py-1 bg-[#0a1428] border border-[#243a5c] rounded text-white text-xs font-mono focus:outline-none focus:border-[#4988C4] uppercase"
        />
      </div>
    </div>
  );
}
