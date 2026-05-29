'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { ClipCustomization } from './clip-customizer';
import type { Transcript } from '@/types';
import { getStoredApiKey } from './api-key-settings';
import { splitTitleLines, maxUnitsForBox, osAwareCssFontFamily } from '@/lib/title-wrap';

interface Props {
  videoSrc: string;
  duration: number;
  startTime: number;
  endTime: number;
  title: string;
  hashtags?: string[];
  layout?: 'letterbox' | 'crop_vertical' | 'custom_background';
  transcript?: Transcript | null;
  /** 프로젝트 ID (transcript 미전달 시 fallback fetch에 사용) */
  projectId?: string;
  /** 1-based 표시 인덱스 (헤더에 #N으로 표시) */
  index?: number;
  /** AI 추천 이유 (헤더 우측에 표시) */
  reason?: string;
  /** 결과 화면으로 돌아가기 (헤더 좌측에 ← 버튼 표시) */
  onBack?: () => void;
  /** 현재 클립의 mp4 다운로드 (헤더에 📥 버튼 표시) */
  onDownload?: () => void;
  onSave: (changes: {
    startTime: number;
    endTime: number;
    title: string;
    hashtags: string[];
    layout: 'letterbox' | 'crop_vertical' | 'custom_background';
  }) => void;
  onRevert?: () => void;
  customization: ClipCustomization;
  onCustomizationChange: (c: ClipCustomization) => void;
}

type TabKey = 'title' | 'channel' | 'layout' | 'subtitle';

const FONTS = [
  { name: 'Pretendard', label: 'Pretendard (기본 — 미리보기와 100% 일치)' },
  { name: 'Standard', label: '스탠다드 (Arial)' },
  { name: 'Malgun Gothic', label: '맑은 고딕 (시스템)' },
  { name: 'Nanum Gothic', label: '나눔고딕 (시스템)' },
  { name: 'Gulim', label: '굴림 (시스템)' },
];

const PRESET_COLORS = [
  { name: '흰색', hex: 'FFFFFF' },
  { name: '검정', hex: '000000' },
  { name: '노랑', hex: 'FFEB3B' },
  { name: '연두', hex: 'B6FF59' },
  { name: '하늘', hex: '40C4FF' },
  { name: '핑크', hex: 'FF80AB' },
  { name: '주황', hex: 'FF9100' },
];

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.floor((s % 1) * 10);
  return `${m}:${sec.toString().padStart(2, '0')}.${ms}`;
}

export function ClipEditorV2({
  videoSrc,
  duration,
  startTime: propStartTime,
  endTime: propEndTime,
  title: propTitle,
  hashtags: propHashtags,
  layout: propLayout,
  transcript: propTranscript,
  projectId,
  index,
  reason,
  onBack,
  onDownload,
  onSave,
  onRevert,
  customization,
  onCustomizationChange,
}: Props) {
  // transcript fallback fetch: prop이 비어있으면 projectId로 직접 가져옴
  // (부모 컴포넌트의 transcript fetch가 늦거나 빈 응답이어도 미리보기 자막 표시 보장)
  const [fetchedTranscript, setFetchedTranscript] = useState<Transcript | null>(null);
  useEffect(() => {
    if (propTranscript && propTranscript.segments && propTranscript.segments.length > 0) return;
    if (!projectId) return;
    let cancelled = false;
    fetch(`/api/projects/transcript?projectId=${projectId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Transcript | null) => {
        if (!cancelled && data && Array.isArray(data.segments) && data.segments.length > 0) {
          setFetchedTranscript(data);
        }
      })
      .catch(() => { /* ignore */ });
    return () => { cancelled = true; };
  }, [propTranscript, projectId]);
  const transcript: Transcript | null =
    (propTranscript && propTranscript.segments?.length ? propTranscript : null) ||
    fetchedTranscript;

  // === Draft 상태 ===
  const [draftStartTime, setDraftStartTime] = useState(propStartTime);
  const [draftEndTime, setDraftEndTime] = useState(propEndTime);
  const [draftTitle, setDraftTitle] = useState(propTitle);
  const [draftLayout, setDraftLayout] = useState<'letterbox' | 'crop_vertical' | 'custom_background'>(
    propLayout || customization.layout,
  );
  const [activeTab, setActiveTab] = useState<TabKey>('title');

  useEffect(() => {
    setDraftStartTime(propStartTime);
    setDraftEndTime(propEndTime);
    setDraftTitle(propTitle);
    setDraftLayout(propLayout || customization.layout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propStartTime, propEndTime, propTitle, propLayout]);

  // mount 시점 customization 스냅샷 (저장/취소 dirty 판단용)
  const initialCustRef = useRef<ClipCustomization>(customization);
  const custDirty =
    JSON.stringify(customization) !== JSON.stringify(initialCustRef.current);

  const isDirty =
    draftStartTime !== propStartTime ||
    draftEndTime !== propEndTime ||
    draftTitle !== propTitle ||
    draftLayout !== (propLayout || customization.layout) ||
    custDirty;

  function handleSave() {
    onSave({
      startTime: draftStartTime,
      endTime: draftEndTime,
      title: draftTitle,
      hashtags: propHashtags || [],
      layout: draftLayout,
    });
    // 저장 시점의 customization을 새 기준으로
    initialCustRef.current = customization;
  }

  function handleResetDraft() {
    setDraftStartTime(propStartTime);
    setDraftEndTime(propEndTime);
    setDraftTitle(propTitle);
    setDraftLayout(propLayout || customization.layout);
    // customization도 처음 진입 시점으로 복원
    onCustomizationChange(initialCustRef.current);
  }

  function updateCust(patch: Partial<ClipCustomization>) {
    onCustomizationChange({ ...customization, ...patch });
  }

  // === 영상 재생 ===
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(propStartTime);
  const [playing, setPlaying] = useState(false);
  // 배속은 customization에 저장 → 다운로드 시 ffmpeg에 적용 (영구 반영)
  const playbackSpeed = customization.playbackSpeed ?? 1;
  const setPlaybackSpeed = (v: number) =>
    onCustomizationChange({ ...customization, playbackSpeed: v });
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.currentTime = draftStartTime;
      setCurrentTime(draftStartTime);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftStartTime]);

  // 속도/음소거 동기화
  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = playbackSpeed;
  }, [playbackSpeed]);
  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => {
      setCurrentTime(v.currentTime);
      if (v.currentTime >= draftEndTime) {
        v.pause();
        setPlaying(false);
        v.currentTime = draftStartTime;
      }
    };
    v.addEventListener('timeupdate', onTime);
    return () => v.removeEventListener('timeupdate', onTime);
  }, [draftStartTime, draftEndTime]);

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (playing) {
      v.pause();
      setPlaying(false);
    } else {
      if (v.currentTime < draftStartTime || v.currentTime >= draftEndTime) {
        v.currentTime = draftStartTime;
      }
      v.play();
      setPlaying(true);
    }
  }

  function jumpToStart() {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = draftStartTime;
    setCurrentTime(draftStartTime);
  }

  function jumpToEnd() {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = draftEndTime;
    setCurrentTime(draftEndTime);
  }

  function stepFrame(delta: number) {
    const v = videoRef.current;
    if (!v) return;
    // 1프레임 ≈ 1/30초
    const next = Math.max(draftStartTime, Math.min(draftEndTime, v.currentTime + delta / 30));
    v.currentTime = next;
    setCurrentTime(next);
  }

  // === Undo / Redo ===
  type Snapshot = {
    draftStartTime: number;
    draftEndTime: number;
    draftTitle: string;
    draftLayout: 'letterbox' | 'crop_vertical' | 'custom_background';
    customization: ClipCustomization;
  };
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [future, setFuture] = useState<Snapshot[]>([]);
  const lastSnapshotRef = useRef<Snapshot | null>(null);

  // 현재 편집 상태가 변하면 history에 push (단, undo/redo 진행 중에는 X)
  const skipNextHistoryRef = useRef(false);
  useEffect(() => {
    if (skipNextHistoryRef.current) {
      skipNextHistoryRef.current = false;
      return;
    }
    const current: Snapshot = {
      draftStartTime,
      draftEndTime,
      draftTitle,
      draftLayout,
      customization,
    };
    if (lastSnapshotRef.current) {
      const prev = lastSnapshotRef.current;
      if (
        prev.draftStartTime === current.draftStartTime &&
        prev.draftEndTime === current.draftEndTime &&
        prev.draftTitle === current.draftTitle &&
        prev.draftLayout === current.draftLayout &&
        JSON.stringify(prev.customization) === JSON.stringify(current.customization)
      ) {
        return;
      }
      setHistory((h) => [...h.slice(-49), prev]);
      setFuture([]);
    }
    lastSnapshotRef.current = current;
  }, [draftStartTime, draftEndTime, draftTitle, draftLayout, customization]);

  function applySnapshot(s: Snapshot) {
    skipNextHistoryRef.current = true;
    setDraftStartTime(s.draftStartTime);
    setDraftEndTime(s.draftEndTime);
    setDraftTitle(s.draftTitle);
    setDraftLayout(s.draftLayout);
    onCustomizationChange(s.customization);
    lastSnapshotRef.current = s;
  }

  function undo() {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    const cur = lastSnapshotRef.current;
    setHistory((h) => h.slice(0, -1));
    if (cur) setFuture((f) => [cur, ...f]);
    applySnapshot(prev);
  }

  function redo() {
    if (future.length === 0) return;
    const next = future[0];
    const cur = lastSnapshotRef.current;
    setFuture((f) => f.slice(1));
    if (cur) setHistory((h) => [...h, cur]);
    applySnapshot(next);
  }

  // 키보드 단축키 (Cmd/Ctrl + Z / Shift+Z)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tgt = e.target as HTMLElement;
      if (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA') return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
      if (e.key === ' ') {
        e.preventDefault();
        togglePlay();
      }
      if (e.key === 'ArrowLeft' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        stepFrame(-1);
      }
      if (e.key === 'ArrowRight' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        stepFrame(1);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, future, playing, draftStartTime, draftEndTime]);

  // === 분할 / 삭제 ===
  function splitAtCursor() {
    // cursor 위치를 클립 끝으로 변경 (단순 split: 한쪽만 유지)
    // 더 정교한 split은 hook을 두 개로 나눠야 함 — 여기선 클립 잘라내기만
    if (currentTime <= draftStartTime + 0.5 || currentTime >= draftEndTime - 0.5) return;
    if (!confirm(`현재 위치(${formatTime(currentTime)})에서 클립을 나누시겠습니까?\n\n선택지:\n- 확인: 앞부분만 유지 (시작~현재)\n- 취소`)) return;
    setDraftEndTime(currentTime);
  }

  function trimFromStart() {
    // 현재 cursor를 시작점으로
    if (currentTime >= draftEndTime - 0.5) return;
    setDraftStartTime(currentTime);
  }

  function trimToEnd() {
    // 현재 cursor를 끝점으로
    if (currentTime <= draftStartTime + 0.5) return;
    setDraftEndTime(currentTime);
  }

  // === 미리보기 오버레이 드래그 (제목/자막 이동 + 크기 조절 + 박스 너비 조절) ===
  const previewBoxRef = useRef<HTMLDivElement>(null);
  // 제목 직접 편집 모드 (미리보기에서 더블클릭 시 활성)
  const [titleEditing, setTitleEditing] = useState(false);
  // 자막 직접 편집: 어떤 segment의 index가 편집 중인지 (-1 = 편집 X)
  const [subtitleEditingIdx, setSubtitleEditingIdx] = useState<number>(-1);
  const [subtitleEditDraft, setSubtitleEditDraft] = useState('');
  // 자막 편집 저장 — 해당 segment text 업데이트 + 서버에 PUT
  async function commitSubtitleEdit(segIdx: number, newText: string) {
    if (!transcript || !projectId || segIdx < 0) return;
    const updated: Transcript = {
      ...transcript,
      segments: transcript.segments.map((s, i) =>
        i === segIdx ? { ...s, text: newText } : s,
      ),
    };
    // 로컬 fetched transcript 갱신 (즉시 미리보기 반영)
    setFetchedTranscript(updated);
    try {
      await fetch('/api/projects/transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, transcript: updated }),
      });
    } catch {
      /* 실패 시에도 로컬은 갱신됨 */
    }
  }
  // 배경 영상 드래그 (세로 크롭 시 pan)
  const [bgDrag, setBgDrag] = useState<{
    startMouseX: number;
    startMouseY: number;
    origX: number;
    origY: number;
    scaleX: number;
    scaleY: number;
  } | null>(null);

  useEffect(() => {
    if (!bgDrag) return;
    function onMove(e: MouseEvent) {
      if (!bgDrag) return;
      const dx = (e.clientX - bgDrag.startMouseX) * bgDrag.scaleX;
      const dy = (e.clientY - bgDrag.startMouseY) * bgDrag.scaleY;
      onCustomizationChange({
        ...customization,
        bgOffsetX: bgDrag.origX + dx,
        bgOffsetY: bgDrag.origY + dy,
      });
    }
    function onUp() {
      setBgDrag(null);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [bgDrag, customization, onCustomizationChange]);
  const [overlayDrag, setOverlayDrag] = useState<{
    target: 'title' | 'subtitle' | 'channel';
    mode: 'move' | 'resize-corner' | 'resize-w' | 'resize-e';
    startMouseX: number;
    startMouseY: number;
    origX: number;
    origY: number;
    origSize: number;
    origBoxWidth: number;
    scaleX: number;
    scaleY: number;
  } | null>(null);

  function startOverlayDrag(
    e: React.MouseEvent,
    target: 'title' | 'subtitle' | 'channel',
    mode: 'move' | 'resize-corner' | 'resize-w' | 'resize-e',
  ) {
    if (!previewBoxRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = previewBoxRef.current.getBoundingClientRect();
    const xKey = draftLayout === 'crop_vertical' ? 'titleXCrop' : 'titleX';
    const yKey = draftLayout === 'crop_vertical' ? 'titleYCrop' : 'titleY';
    let origX = 540;
    let origY = 0;
    let origSize = 60;
    if (target === 'title') {
      origX = customization[xKey];
      origY = customization[yKey];
      origSize = customization.titleFontSize;
    } else if (target === 'subtitle') {
      origX = customization.subtitleX ?? 540;
      origY = customization.subtitleY;
      origSize = customization.subtitleFontSize;
    } else if (target === 'channel') {
      origX = customization.channelX;
      origY = customization.channelY;
      origSize = customization.channelFontSize;
    }
    // boxWidth는 target별로 다른 필드 참조
    const origBoxWidth =
      target === 'subtitle'
        ? customization.subtitleBoxWidth ?? 1080
        : customization.titleBoxWidth;
    setOverlayDrag({
      target,
      mode,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      origX,
      origY,
      origSize,
      origBoxWidth,
      scaleX: 1080 / rect.width,
      scaleY: 1920 / rect.height,
    });
  }

  useEffect(() => {
    if (!overlayDrag) return;
    function onMove(e: MouseEvent) {
      if (!overlayDrag) return;
      const dx = (e.clientX - overlayDrag.startMouseX) * overlayDrag.scaleX;
      const dy = (e.clientY - overlayDrag.startMouseY) * overlayDrag.scaleY;
      if (overlayDrag.mode === 'move') {
        if (overlayDrag.target === 'title') {
          const xKey = draftLayout === 'crop_vertical' ? 'titleXCrop' : 'titleX';
          const yKey = draftLayout === 'crop_vertical' ? 'titleYCrop' : 'titleY';
          onCustomizationChange({
            ...customization,
            [xKey]: Math.max(0, Math.min(1080, overlayDrag.origX + dx)),
            [yKey]: Math.max(0, Math.min(1920, overlayDrag.origY + dy)),
          });
        } else if (overlayDrag.target === 'subtitle') {
          onCustomizationChange({
            ...customization,
            subtitleX: Math.max(0, Math.min(1080, overlayDrag.origX + dx)),
            subtitleY: Math.max(0, Math.min(1920, overlayDrag.origY + dy)),
          });
        } else if (overlayDrag.target === 'channel') {
          onCustomizationChange({
            ...customization,
            channelX: Math.max(0, Math.min(1080, overlayDrag.origX + dx)),
            channelY: Math.max(0, Math.min(1920, overlayDrag.origY + dy)),
          });
        }
      } else if (overlayDrag.mode === 'resize-corner') {
        // 모서리: dx(좌우) → 박스 너비, dy(상하) → 폰트 크기를 동시에 조정
        if (overlayDrag.target === 'title') {
          // center 정렬이므로 dx만큼 한쪽 늘어나면 반대쪽도 같이 → ×2
          const widthDelta = dx * 2;
          const newWidth = Math.max(
            200,
            Math.min(1080, overlayDrag.origBoxWidth + widthDelta),
          );
          const newSize = Math.max(
            8,
            Math.min(500, overlayDrag.origSize + dy),
          );
          onCustomizationChange({
            ...customization,
            titleBoxWidth: newWidth,
            titleFontSize: newSize,
          });
        } else if (overlayDrag.target === 'channel') {
          // 채널: 대각선 거리로 fontSize 변경
          const delta = (dx + dy) / 2;
          const newSize = Math.max(8, Math.min(500, overlayDrag.origSize + delta));
          onCustomizationChange({ ...customization, channelFontSize: newSize });
        } else {
          // subtitle은 너비 개념이 없으니 폰트 크기만 (대각선 거리)
          const delta = (dx + dy) / 2;
          const newSize = Math.max(8, Math.min(500, overlayDrag.origSize + delta));
          onCustomizationChange({ ...customization, subtitleFontSize: newSize });
        }
      } else if (overlayDrag.target === 'title') {
        // resize-w/e: 박스 너비 조정 (center 정렬이므로 양쪽 동시 늘어남 → ×2)
        const widthDelta =
          overlayDrag.mode === 'resize-e' ? dx * 2 : -dx * 2;
        const newWidth = Math.max(
          200,
          Math.min(1080, overlayDrag.origBoxWidth + widthDelta),
        );
        onCustomizationChange({ ...customization, titleBoxWidth: newWidth });
      } else if (overlayDrag.target === 'subtitle') {
        // 자막 박스 너비 — boxWidth 변경 + maxCharsPerLine도 비례 자동 갱신
        const widthDelta =
          overlayDrag.mode === 'resize-e' ? dx * 2 : -dx * 2;
        const newWidth = Math.max(
          200,
          Math.min(1080, overlayDrag.origBoxWidth + widthDelta),
        );
        // 새 너비 비율로 maxCharsPerLine 자동 추정 (한 줄 12자 = boxWidth 990 기준)
        const autoChars = Math.max(4, Math.round((newWidth / 1080) * 14));
        onCustomizationChange({
          ...customization,
          subtitleBoxWidth: newWidth,
          subtitleMaxCharsPerLine: autoChars,
        });
      }
    }
    function onUp() {
      setOverlayDrag(null);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [overlayDrag, draftLayout, customization, onCustomizationChange]);

  // === 타임라인 드래그 + 줌 ===
  const timelineRef = useRef<HTMLDivElement>(null);
  const timelineScrollRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<'start' | 'end' | 'cursor' | null>(null);
  const [timelineZoom, setTimelineZoom] = useState(1);

  // 처음 진입 / 클립 변경 시 클립이 잘 보이도록 자동 zoom + scroll
  useEffect(() => {
    if (duration <= 0) return;
    const clipDur = Math.max(0.1, propEndTime - propStartTime);
    // 클립의 약 40% 여유분을 포함해 화면 폭에 채움
    const targetVisible = Math.max(clipDur * 1.4, 10);
    const z = Math.max(1, Math.min(40, duration / targetVisible));
    setTimelineZoom(z);
    requestAnimationFrame(() => {
      const scroll = timelineScrollRef.current;
      if (!scroll) return;
      const totalWidth = scroll.scrollWidth;
      const visibleWidth = scroll.clientWidth;
      const centerTime = (propStartTime + propEndTime) / 2;
      const centerX = (centerTime / duration) * totalWidth;
      scroll.scrollLeft = Math.max(0, centerX - visibleWidth / 2);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propStartTime, propEndTime, duration]);

  // 줌 변경 시 cursor를 화면 중앙에 유지하도록 scroll 조정
  function changeZoom(newZoom: number) {
    const scroll = timelineScrollRef.current;
    if (!scroll) {
      setTimelineZoom(newZoom);
      return;
    }
    const visibleWidth = scroll.clientWidth;
    const oldZoom = timelineZoom;
    const oldScrollLeft = scroll.scrollLeft;
    // 화면 중앙이 가리키는 시간점
    const centerTime =
      ((oldScrollLeft + visibleWidth / 2) / (visibleWidth * oldZoom)) * duration;
    setTimelineZoom(newZoom);
    requestAnimationFrame(() => {
      if (!scroll) return;
      const newTotal = visibleWidth * newZoom;
      const newCenterX = (centerTime / duration) * newTotal;
      scroll.scrollLeft = Math.max(0, newCenterX - visibleWidth / 2);
    });
  }

  // Ctrl/Cmd + 휠로 줌 (속도 30% 감소: 1.2 → 1.14)
  function handleTimelineWheel(e: React.WheelEvent) {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.14 : 1 / 1.14;
    changeZoom(Math.max(1, Math.min(40, timelineZoom * factor)));
  }

  const handleTimelineDrag = useCallback(
    (clientX: number) => {
      if (!timelineRef.current) return;
      const rect = timelineRef.current.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const time = pct * duration;
      if (dragging === 'start') {
        const newStart = Math.min(time, draftEndTime - 1);
        setDraftStartTime(Math.max(0, newStart));
      } else if (dragging === 'end') {
        const newEnd = Math.max(time, draftStartTime + 1);
        setDraftEndTime(Math.min(duration, newEnd));
      } else if (dragging === 'cursor') {
        const newTime = Math.max(draftStartTime, Math.min(draftEndTime, time));
        // 시각 즉시 업데이트 (video seek 완료를 기다리지 않고)
        setCurrentTime(newTime);
        const v = videoRef.current;
        if (v) v.currentTime = newTime;
      }
    },
    [dragging, duration, draftStartTime, draftEndTime],
  );

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => handleTimelineDrag(e.clientX);
    const onUp = () => setDragging(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging, handleTimelineDrag]);

  const startPct = (draftStartTime / duration) * 100;
  const endPct = (draftEndTime / duration) * 100;
  const cursorPct = (currentTime / duration) * 100;

  return (
    <div className="flex flex-col h-[calc(100vh-72px)] bg-[#0a1428] overflow-hidden">
      {/* 상단 헤더 — 제목 + 번호/사유 + 액션 */}
      <div className="px-4 py-2 border-b border-[#243a5c] flex items-center justify-between gap-4 bg-[#11203d] shrink-0">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {onBack && (
            <button
              onClick={onBack}
              className="text-gray-400 hover:text-white text-sm whitespace-nowrap"
              title="결과 화면으로"
            >
              ← 뒤로
            </button>
          )}
          <h2 className="text-white font-bold text-base whitespace-nowrap">
            ✂️ 쇼츠 편집
            {typeof index === 'number' && (
              <span className="text-[#4988C4] ml-2">#{index}</span>
            )}
          </h2>
          {isDirty && (
            <span className="text-[11px] px-2 py-0.5 bg-orange-500/20 text-orange-400 rounded font-bold shrink-0">
              변경됨
            </span>
          )}
          {reason && (
            <span
              className="text-gray-400 text-xs truncate min-w-0 flex-1"
              title={reason}
            >
              {reason}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {onDownload && (
            <button
              onClick={() => {
                if (isDirty) {
                  // 저장 안 된 변경 → 자동 저장(=재생성 트리거) 후 안내
                  handleSave();
                  alert(
                    '편집 내용을 저장했습니다.\n\n새 영상이 만들어지는 동안(보통 10~30초) 좌측 사이드바에서 이 클립의 썸네일이 갱신됩니다.\n갱신된 후 다시 [📥 다운로드] 버튼을 눌러주세요.',
                  );
                  return;
                }
                onDownload();
              }}
              className={`px-3 py-1.5 border rounded text-xs transition flex items-center gap-1 ${
                isDirty
                  ? 'bg-orange-500/20 border-orange-500/50 text-orange-200 hover:bg-orange-500/30'
                  : 'bg-[#11203d] border-[#243a5c] text-gray-100 hover:bg-[#1a2d4d]'
              }`}
              title={
                isDirty
                  ? '변경사항이 저장 안 됨 — 클릭하면 자동 저장 + 재생성 (완료 후 다시 다운로드 가능)'
                  : '이 쇼츠 MP4 다운로드'
              }
            >
              {isDirty ? '💾 저장하고 재생성' : '📥 MP4 다운로드'}
            </button>
          )}
          {onRevert && (
            <button
              onClick={onRevert}
              className="px-3 py-1.5 bg-[#1a2d4d] border border-[#243a5c] text-gray-300 rounded text-xs hover:bg-[#243a5c] transition"
              title="AI가 처음 추천한 원본으로 되돌리기"
            >
              🔄 되돌리기
            </button>
          )}
          <button
            onClick={handleResetDraft}
            disabled={!isDirty}
            className="px-3 py-1.5 bg-[#1a2d4d] border border-[#243a5c] text-gray-400 rounded text-xs hover:bg-[#243a5c] disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            ↩️ 취소
          </button>
          <button
            onClick={handleSave}
            disabled={!isDirty}
            className="px-4 py-1.5 bg-[#1C4D8D] text-white rounded text-xs font-bold hover:bg-[#0F2854] disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            💾 저장
          </button>
        </div>
      </div>

      {/* 중앙: 좌(미리보기) + 우(탭) */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* 좌 — 영상 미리보기 (padding 최소화, 9:16 영역을 굵은 선으로 강조) */}
        <div className="flex-1 bg-black flex items-center justify-center p-1 relative">
          <div
            ref={previewBoxRef}
            className="relative h-full aspect-[9/16] max-w-full ring-4 ring-[#4988C4] shadow-[0_0_0_2px_#0a1428] rounded-sm overflow-hidden"
            style={{ containerType: 'size' } as React.CSSProperties}
            title="실제 출력되는 9:16 쇼츠 영역"
          >
            <video
              ref={videoRef}
              src={videoSrc}
              preload="metadata"
              className="absolute inset-0 w-full h-full bg-black"
              style={{
                objectFit: draftLayout === 'crop_vertical' ? 'cover' : 'contain',
                transform:
                  draftLayout === 'crop_vertical'
                    ? `scale(${customization.bgZoom}) translate(${
                        (customization.bgOffsetX / 1080) * 100
                      }%, ${(customization.bgOffsetY / 1920) * 100}%)`
                    : undefined,
                transformOrigin: 'center center',
                cursor:
                  draftLayout === 'crop_vertical' && !overlayDrag
                    ? bgDrag
                      ? 'grabbing'
                      : 'grab'
                    : 'default',
              }}
              onMouseDown={(e) => {
                if (draftLayout !== 'crop_vertical') return;
                if (!previewBoxRef.current) return;
                e.preventDefault();
                const rect = previewBoxRef.current.getBoundingClientRect();
                setBgDrag({
                  startMouseX: e.clientX,
                  startMouseY: e.clientY,
                  origX: customization.bgOffsetX,
                  origY: customization.bgOffsetY,
                  scaleX: 1080 / rect.width,
                  scaleY: 1920 / rect.height,
                });
              }}
              onWheel={(e) => {
                if (draftLayout !== 'crop_vertical') return;
                e.preventDefault();
                const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
                const newZoom = Math.max(
                  1,
                  Math.min(5, customization.bgZoom * factor),
                );
                onCustomizationChange({ ...customization, bgZoom: newZoom });
              }}
            />
            {/* 제목 오버레이 — 드래그 이동 / 코너 크기 / 좌우 너비 / 더블클릭 편집 */}
            {(draftTitle || titleEditing) && (() => {
              const titleXVal =
                draftLayout === 'crop_vertical'
                  ? customization.titleXCrop
                  : customization.titleX;
              const titleYVal =
                draftLayout === 'crop_vertical'
                  ? customization.titleYCrop
                  : customization.titleY;
              const isMoving =
                overlayDrag?.target === 'title' && overlayDrag.mode === 'move';
              return (
                <div
                  className="absolute -translate-x-1/2 select-none group"
                  style={{
                    left: `${(titleXVal / 1080) * 100}%`,
                    // ffmpeg drawtext와 위치 매칭을 위해 CSS line-height의 위쪽 여분을 보정
                    // (CSS는 line-box top에 (lh-1)/2 * fontSize의 자동 여백이 있음)
                    top: `calc(${(titleYVal / 1920) * 100}% - ${((customization.titleFontSize * 0.125) / 1920) * 100}cqh)`,
                    width: `${(customization.titleBoxWidth / 1080) * 100}%`,
                    fontSize: `${(customization.titleFontSize / 1920) * 100}cqh`,
                    fontWeight: customization.titleBold ? 700 : 400,
                    color: `#${customization.titleColor}`,
                    // ffmpeg borderw(fontSize × 0.04, bold 시 0.06)와 동일 비율의 8방향 stroke
                    textShadow: (() => {
                      const factor = customization.titleBold ? 0.06 : 0.04;
                      const sw = `${((customization.titleFontSize * factor) / 1920) * 100}cqh`;
                      return [
                        `-${sw} -${sw} 0 #000`,
                        `0 -${sw} 0 #000`,
                        `${sw} -${sw} 0 #000`,
                        `${sw} 0 0 #000`,
                        `${sw} ${sw} 0 #000`,
                        `0 ${sw} 0 #000`,
                        `-${sw} ${sw} 0 #000`,
                        `-${sw} 0 0 #000`,
                      ].join(', ');
                    })(),
                    fontFamily: osAwareCssFontFamily(customization.titleFontName),
                    // 줄 높이를 픽셀 비율로 명시 (ffmpeg lineHeight = fontSize × 1.25 와 동일)
                    lineHeight: 1.25,
                    letterSpacing: 'normal',
                    padding: 0,
                    margin: 0,
                    // ffmpeg drawtext와 동일하게 사전 분할된 줄만 표시 (auto-wrap X)
                    whiteSpace: 'pre',
                    textAlign: customization.titleAlign,
                    cursor: titleEditing ? 'text' : isMoving ? 'grabbing' : 'grab',
                  }}
                  onMouseDown={(e) => {
                    if (titleEditing) return;
                    startOverlayDrag(e, 'title', 'move');
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setTitleEditing(true);
                  }}
                  title="더블클릭하면 텍스트 직접 편집"
                >
                  {/* hover/편집 시 점선 외곽선 */}
                  <div
                    className={`absolute -inset-1 border-2 border-dashed pointer-events-none rounded transition-colors ${
                      titleEditing
                        ? 'border-[#4988C4]'
                        : 'border-[#4988C4]/0 group-hover:border-[#4988C4]/80'
                    }`}
                  />
                  {titleEditing ? (
                    <textarea
                      autoFocus
                      value={draftTitle}
                      onChange={(e) => setDraftTitle(e.target.value)}
                      onBlur={() => setTitleEditing(false)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') setTitleEditing(false);
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                          setTitleEditing(false);
                        }
                      }}
                      rows={Math.max(1, draftTitle.split('\n').length)}
                      className="w-full bg-transparent outline-none resize-none text-center"
                      style={{
                        font: 'inherit',
                        color: 'inherit',
                        textAlign: customization.titleAlign,
                        textShadow: 'inherit',
                        lineHeight: 'inherit',
                      }}
                    />
                  ) : (
                    // ffmpeg와 동일한 split 로직 — 사용자가 보는 그대로가 .mp4로 나옴
                    splitTitleLines(
                      draftTitle,
                      maxUnitsForBox(
                        customization.titleBoxWidth,
                        customization.titleFontSize,
                      ),
                    )
                      .slice(0, 3)
                      .join('\n')
                  )}
                  {!titleEditing && (
                    <>
                      {/* 좌측 — 너비 조정 */}
                      <div
                        onMouseDown={(e) => startOverlayDrag(e, 'title', 'resize-w')}
                        className="absolute -left-2 top-1/2 -translate-y-1/2 w-3 h-8 bg-[#4988C4] border-2 border-white rounded-sm opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ cursor: 'ew-resize' }}
                        title="드래그해서 박스 너비 조절"
                      />
                      {/* 우측 — 너비 조정 */}
                      <div
                        onMouseDown={(e) => startOverlayDrag(e, 'title', 'resize-e')}
                        className="absolute -right-2 top-1/2 -translate-y-1/2 w-3 h-8 bg-[#4988C4] border-2 border-white rounded-sm opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ cursor: 'ew-resize' }}
                        title="드래그해서 박스 너비 조절"
                      />
                      {/* 우하 코너 — 폰트 크기 조정 */}
                      <div
                        onMouseDown={(e) => startOverlayDrag(e, 'title', 'resize-corner')}
                        className="absolute -right-2 -bottom-2 w-3 h-3 bg-[#4988C4] border-2 border-white rounded-sm opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ cursor: 'nwse-resize' }}
                        title="드래그해서 폰트 크기 조절"
                      />
                    </>
                  )}
                </div>
              );
            })()}
            {/* 말자막 오버레이 — 드래그로 이동, 코너로 크기 조절 (레이아웃 무관 항상 표시) */}
            {customization.subtitleEnabled && (() => {
              // 자막 segment 매칭 + 그 segment의 index를 함께 추적 (편집 시 필요)
              const segIdx = transcript
                ? transcript.segments.findIndex(
                    (s) => s.start <= currentTime && s.end >= currentTime,
                  )
                : -1;
              const seg = segIdx >= 0 && transcript ? transcript.segments[segIdx] : undefined;
              const inClipIdx = !seg && transcript
                ? transcript.segments.findIndex(
                    (s) => s.end > propStartTime && s.start < propEndTime,
                  )
                : -1;
              const inClipSeg = inClipIdx >= 0 && transcript
                ? transcript.segments[inClipIdx]
                : undefined;
              const nearestIdx = !seg && !inClipSeg && transcript
                ? transcript.segments
                    .map((s, i) => ({
                      i,
                      d: Math.abs((s.start + s.end) / 2 - currentTime),
                    }))
                    .sort((a, b) => a.d - b.d)[0]?.i ?? -1
                : -1;
              const nearestSeg = nearestIdx >= 0 && transcript
                ? transcript.segments[nearestIdx]
                : undefined;
              // 표시할 텍스트 + 매칭 segment의 index (편집 시 사용)
              const matchedIdx =
                segIdx >= 0 ? segIdx : inClipIdx >= 0 ? inClipIdx : nearestIdx;
              const text =
                seg?.text || inClipSeg?.text || nearestSeg?.text || '예시 자막';
              if (!text) return null;
              // 미리보기 줄바꿈 — 사용자가 슬라이더로 정한 maxCharsPerLine을 즉시 반영.
              // 어절(공백) 우선, 없으면 maxChars에서 강제 절단.
              const maxLineChars = Math.max(
                4,
                customization.subtitleMaxCharsPerLine ?? 13,
              );
              const previewLines: string[] = (() => {
                const t = text.trim().replace(/\s+/g, ' ');
                if (t.length <= maxLineChars) return [t];
                const lines: string[] = [];
                let rem = t;
                while (rem.length > maxLineChars) {
                  const sp = rem.lastIndexOf(' ', maxLineChars);
                  const cut = sp > Math.floor(maxLineChars * 0.5) ? sp : maxLineChars;
                  lines.push(rem.slice(0, cut).trim());
                  rem = rem.slice(cut).trim();
                }
                if (rem) lines.push(rem);
                return lines;
              })();
              const isMoving =
                overlayDrag?.target === 'subtitle' && overlayDrag.mode === 'move';
              const isEditing = subtitleEditingIdx === matchedIdx && matchedIdx >= 0;
              return (
                <div
                  className="absolute -translate-x-1/2 text-center px-2 select-none group"
                  style={{
                    left: `${((customization.subtitleX ?? 540) / 1080) * 100}%`,
                    top: `${(customization.subtitleY / 1920) * 100}%`,
                    width: `${((customization.subtitleBoxWidth ?? 1080) / 1080) * 100}%`,
                    fontSize: `${(customization.subtitleFontSize / 1920) * 100}cqh`,
                    color: `#${customization.subtitleColor}`,
                    fontWeight: customization.subtitleBold ? 700 : 400,
                    fontFamily: osAwareCssFontFamily(customization.subtitleFontName),
                    WebkitTextStroke: customization.subtitleOutlineEnabled
                      ? `${(customization.subtitleOutlineWidth / 1920) * 100}cqh #${customization.subtitleOutlineColor}`
                      : undefined,
                    paintOrder: 'stroke fill',
                    lineHeight: 1.25,
                    whiteSpace: 'normal',
                    wordBreak: 'keep-all',
                    cursor: isEditing ? 'text' : isMoving ? 'grabbing' : 'grab',
                  }}
                  onMouseDown={(e) => {
                    if (isEditing) return;
                    startOverlayDrag(e, 'subtitle', 'move');
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    if (matchedIdx >= 0 && transcript) {
                      setSubtitleEditingIdx(matchedIdx);
                      setSubtitleEditDraft(transcript.segments[matchedIdx].text);
                    }
                  }}
                  title={isEditing ? '편집 중 — Enter 또는 외부 클릭으로 저장' : '드래그=이동, 더블클릭=텍스트 편집, 코너=크기'}
                >
                  <div
                    className={`absolute -inset-1 border-2 border-dashed pointer-events-none rounded transition-colors ${
                      isEditing
                        ? 'border-[#4988C4]'
                        : 'border-[#4988C4]/0 group-hover:border-[#4988C4]/80'
                    }`}
                  />
                  {isEditing ? (
                    <input
                      autoFocus
                      value={subtitleEditDraft}
                      onChange={(e) => setSubtitleEditDraft(e.target.value)}
                      onBlur={() => {
                        commitSubtitleEdit(matchedIdx, subtitleEditDraft.trim());
                        setSubtitleEditingIdx(-1);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          commitSubtitleEdit(matchedIdx, subtitleEditDraft.trim());
                          setSubtitleEditingIdx(-1);
                        }
                        if (e.key === 'Escape') {
                          setSubtitleEditingIdx(-1);
                        }
                      }}
                      className="bg-transparent outline-none text-center"
                      style={{
                        font: 'inherit',
                        color: 'inherit',
                        textShadow: 'inherit',
                        minWidth: '4ch',
                        width: `${Math.max(subtitleEditDraft.length, 4)}ch`,
                      }}
                    />
                  ) : (
                    previewLines.map((ln, i) => (
                      <div key={i}>{ln}</div>
                    ))
                  )}
                  {!isEditing && (
                    <>
                      {/* 좌측 너비 핸들 */}
                      <div
                        onMouseDown={(e) => startOverlayDrag(e, 'subtitle', 'resize-w')}
                        className="absolute -left-2 top-1/2 -translate-y-1/2 w-3 h-8 bg-[#4988C4] border-2 border-white rounded-sm opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ cursor: 'ew-resize' }}
                        title="드래그해서 자막 박스 너비 조절"
                      />
                      {/* 우측 너비 핸들 */}
                      <div
                        onMouseDown={(e) => startOverlayDrag(e, 'subtitle', 'resize-e')}
                        className="absolute -right-2 top-1/2 -translate-y-1/2 w-3 h-8 bg-[#4988C4] border-2 border-white rounded-sm opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ cursor: 'ew-resize' }}
                        title="드래그해서 자막 박스 너비 조절"
                      />
                      {/* 우하 코너 — 폰트 크기 */}
                      <div
                        onMouseDown={(e) => startOverlayDrag(e, 'subtitle', 'resize-corner')}
                        className="absolute -right-2 -bottom-2 w-3 h-3 bg-[#4988C4] border-2 border-white rounded-sm opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ cursor: 'nwse-resize' }}
                        title="드래그해서 폰트 크기 조절"
                      />
                    </>
                  )}
                </div>
              );
            })()}
            {/* 채널 오버레이 — 드래그 이동 / 코너로 크기 조절 */}
            {customization.channelEnabled && customization.channelText.trim() && (() => {
              const isMoving =
                overlayDrag?.target === 'channel' && overlayDrag.mode === 'move';
              return (
                <div
                  className="absolute -translate-x-1/2 -translate-y-1/2 text-center px-2 select-none group whitespace-nowrap"
                  style={{
                    left: `${(customization.channelX / 1080) * 100}%`,
                    top: `${(customization.channelY / 1920) * 100}%`,
                    fontSize: `${customization.channelFontSize / 1920 * 100}cqh`,
                    color: `#${customization.channelColor}`,
                    fontWeight: customization.channelBold ? 700 : 400,
                    textShadow: '-1px -1px 0 #000, 1px 1px 0 #000',
                    fontFamily: osAwareCssFontFamily(customization.channelFontName),
                    cursor: isMoving ? 'grabbing' : 'grab',
                  }}
                  onMouseDown={(e) => startOverlayDrag(e, 'channel', 'move')}
                  title="드래그해서 이동, 코너로 크기 조절"
                >
                  <div className="absolute -inset-1 border-2 border-dashed border-[#4988C4]/0 group-hover:border-[#4988C4]/80 pointer-events-none rounded transition-colors" />
                  {customization.channelText}
                  <div
                    onMouseDown={(e) => startOverlayDrag(e, 'channel', 'resize-corner')}
                    className="absolute -right-2 -bottom-2 w-3 h-3 bg-[#4988C4] border-2 border-white rounded-sm opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ cursor: 'nwse-resize' }}
                    title="드래그해서 크기 조절"
                  />
                </div>
              );
            })()}
          </div>
        </div>

        {/* 우 — 탭 설정 */}
        <div className="w-[400px] border-l border-[#243a5c] flex flex-col bg-[#0a1428] shrink-0">
          <div className="flex border-b border-[#243a5c] bg-[#11203d]">
            {(['title', 'channel', 'layout', 'subtitle'] as TabKey[]).map((k) => (
              <button
                key={k}
                onClick={() => setActiveTab(k)}
                className={`flex-1 px-3 py-3 text-xs font-bold transition ${
                  activeTab === k
                    ? 'text-white border-b-2 border-[#4988C4] bg-[#0a1428]'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {k === 'title' && '쇼츠 제목'}
                {k === 'channel' && '채널명'}
                {k === 'layout' && '레이아웃'}
                {k === 'subtitle' && '말자막'}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {activeTab === 'title' && (
              <TitlePanel
                draftTitle={draftTitle}
                setDraftTitle={setDraftTitle}
                customization={customization}
                updateCust={updateCust}
                transcript={transcript}
                projectId={projectId}
                startTime={draftStartTime}
                endTime={draftEndTime}
                fallbackContext={reason || propTitle}
              />
            )}
            {activeTab === 'channel' && (
              <ChannelPanel customization={customization} updateCust={updateCust} />
            )}
            {activeTab === 'layout' && (
              <LayoutPanel
                draftLayout={draftLayout}
                setDraftLayout={setDraftLayout}
                customization={customization}
                updateCust={updateCust}
                projectId={projectId}
              />
            )}
            {activeTab === 'subtitle' && (
              <SubtitlePanel customization={customization} updateCust={updateCust} />
            )}
          </div>
        </div>
      </div>

      {/* 하단 타임라인 */}
      <div className="border-t border-[#243a5c] bg-[#11203d] px-3 py-2 shrink-0">
        {/* 통합 액션 bar: 속도/Undo/분할/재생/이동/시간/zoom */}
        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
          {/* 속도 */}
          <div className="flex items-center gap-1.5 px-2 h-8 bg-[#11203d] border border-[#243a5c] rounded">
            <span className="text-[10px] text-gray-400">속도</span>
            <select
              value={playbackSpeed}
              onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
              className="bg-transparent text-white text-xs focus:outline-none cursor-pointer"
            >
              <option value={1.0}>1.0x</option>
              <option value={1.1}>1.1x</option>
              <option value={1.2}>1.2x</option>
              <option value={1.3}>1.3x</option>
              <option value={1.4}>1.4x</option>
              <option value={1.5}>1.5x</option>
              <option value={1.6}>1.6x</option>
              <option value={1.7}>1.7x</option>
              <option value={1.8}>1.8x</option>
              <option value={1.9}>1.9x</option>
              <option value={2.0}>2.0x</option>
            </select>
          </div>
          <Sep />
          <ActionBtn onClick={undo} disabled={history.length === 0} title="실행 취소 (Cmd/Ctrl+Z)">↶</ActionBtn>
          <ActionBtn onClick={redo} disabled={future.length === 0} title="다시 실행 (Cmd/Ctrl+Shift+Z)">↷</ActionBtn>
          <Sep />
          <ActionBtn onClick={trimFromStart} title="현재 위치를 시작점으로">[</ActionBtn>
          <ActionBtn onClick={splitAtCursor} title="현재 위치에서 분할 (앞부분만 유지)">[⎮]</ActionBtn>
          <ActionBtn onClick={trimToEnd} title="현재 위치를 끝점으로">]</ActionBtn>
          <ActionBtn
            onClick={() => {
              if (confirm('편집 내용을 모두 초기화합니다.')) handleResetDraft();
            }}
            title="편집 초기화"
          >🗑</ActionBtn>
          <Sep />
          <ActionBtn onClick={togglePlay} variant="primary" title="재생 / 일시정지 (Space)">
            {playing ? '⏸' : '▶'}
          </ActionBtn>
          <ActionBtn onClick={jumpToStart} title="클립 시작 지점으로">⏮</ActionBtn>
          <ActionBtn onClick={jumpToEnd} title="클립 끝 지점으로">⏭</ActionBtn>
          <ActionBtn onClick={() => stepFrame(-1)} title="1프레임 뒤로 (←)">«</ActionBtn>
          <ActionBtn onClick={() => stepFrame(1)} title="1프레임 앞으로 (→)">»</ActionBtn>
          <ActionBtn onClick={() => setMuted((m) => !m)} title={muted ? '음소거 해제' : '음소거'}>
            {muted ? '🔇' : '🔊'}
          </ActionBtn>

          <div className="flex-1" />

          {/* 시간 표시 */}
          <div className="text-xs text-gray-400 font-mono whitespace-nowrap mr-2">
            <span className="text-white font-bold">{formatTime(draftStartTime)}</span>
            <span className="text-gray-600 mx-1">~</span>
            <span className="text-white font-bold">{formatTime(draftEndTime)}</span>
            <span className="text-gray-500 ml-2">({Math.round(draftEndTime - draftStartTime)}초)</span>
            <span className="text-gray-600 mx-2">|</span>
            <span className="text-gray-400">현재 {formatTime(currentTime)} / {formatTime(duration)}</span>
          </div>
          <ZoomSlider zoom={timelineZoom} onChange={changeZoom} min={1} max={28} />
        </div>

        {/* 타임라인 바 — 더 높게, 파형 배경, scroll 컨테이너로 zoom 지원 */}
        <div
          ref={timelineScrollRef}
          onWheel={handleTimelineWheel}
          className="overflow-x-auto overflow-y-hidden rounded border border-[#243a5c] bg-[#0a1428]"
        >
        {/* 시간 ruler (시간 눈금) */}
        <TimelineRuler duration={duration} zoom={timelineZoom} />
        <div
          ref={timelineRef}
          className="relative h-24 select-none cursor-pointer"
          style={{ width: (timelineZoom * 100) + '%', minWidth: '100%' }}
          onMouseDown={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const pct = (e.clientX - rect.left) / rect.width;
            const time = pct * duration;
            // 클릭 위치에 따라 가장 가까운 핸들 또는 cursor 이동
            const distStart = Math.abs(time - draftStartTime);
            const distEnd = Math.abs(time - draftEndTime);
            if (distStart < 0.5 && distStart < distEnd) {
              setDragging('start');
            } else if (distEnd < 0.5) {
              setDragging('end');
            } else {
              // cursor 위치로 이동
              if (videoRef.current) {
                videoRef.current.currentTime = Math.max(
                  draftStartTime,
                  Math.min(draftEndTime, time),
                );
              }
            }
          }}
        >
          {/* 전체 영상 영역 */}
          <div className="absolute inset-0 px-0">
            {/* 파형 (audio peaks) — 전체 영역 배경 */}
            <Waveform videoSrc={videoSrc} />
            {/* 선택된 클립 영역 — 더 진하게 강조 + 어두운 마스크로 외부 dim */}
            <div
              className="absolute top-0 bottom-0 bg-[#4988C4]/40 ring-2 ring-[#4988C4] z-10"
              style={{
                left: `${startPct}%`,
                width: `${endPct - startPct}%`,
              }}
            />
            {/* 좌측(클립 시작 전) 어두운 마스크 */}
            <div
              className="absolute top-0 bottom-0 left-0 bg-black/55 pointer-events-none"
              style={{ width: `${startPct}%` }}
            />
            {/* 우측(클립 끝 후) 어두운 마스크 */}
            <div
              className="absolute top-0 bottom-0 right-0 bg-black/55 pointer-events-none"
              style={{ width: `${100 - endPct}%` }}
            />
            {/* 시작 핸들 — 더 크게 */}
            <div
              className="absolute top-0 bottom-0 w-4 -ml-2 bg-[#4988C4] cursor-ew-resize hover:bg-[#BDE8F5] flex items-center justify-center z-20 rounded-l-sm"
              style={{ left: `${startPct}%` }}
              onMouseDown={(e) => {
                e.stopPropagation();
                setDragging('start');
              }}
              title="시작 시점 조정"
            >
              <div className="w-0.5 h-10 bg-white" />
            </div>
            {/* 끝 핸들 — 더 크게 */}
            <div
              className="absolute top-0 bottom-0 w-4 -ml-2 bg-[#4988C4] cursor-ew-resize hover:bg-[#BDE8F5] flex items-center justify-center z-20 rounded-r-sm"
              style={{ left: `${endPct}%` }}
              onMouseDown={(e) => {
                e.stopPropagation();
                setDragging('end');
              }}
              title="끝 시점 조정"
            >
              <div className="w-0.5 h-6 bg-white" />
            </div>
            {/* 현재 재생 위치 (cursor) — 클릭 + 좌우 드래그로 이동 */}
            <div
              className="absolute top-0 bottom-0 z-30 cursor-ew-resize select-none group"
              style={{
                left: `${cursorPct}%`,
                width: '14px',
                transform: 'translateX(-50%)',
              }}
              onMouseDown={(e) => {
                e.stopPropagation();
                setDragging('cursor');
              }}
              title="잡고 좌우로 끌어서 재생 위치 이동"
            >
              {/* 빨간 세로 바 (시각) */}
              <div className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-0.5 bg-red-500" />
              {/* hover/drag 시 손잡이 강조 */}
              <div className="absolute left-1/2 -translate-x-1/2 top-0 w-3 h-3 -mt-0.5 bg-red-500 rounded-sm opacity-70 group-hover:opacity-100 transition-opacity" />
              <div className="absolute left-1/2 -translate-x-1/2 bottom-0 w-3 h-3 -mb-0.5 bg-red-500 rounded-sm opacity-70 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
        </div>
        </div>

        {/* 정밀 조정 (초 단위) */}
        <div className="mt-3 flex items-center gap-3 text-xs text-gray-400">
          <span>정밀 조정:</span>
          <button
            onClick={() => setDraftStartTime(Math.max(0, draftStartTime - 0.5))}
            className="px-2 py-1 bg-[#1a2d4d] hover:bg-[#243a5c] rounded text-gray-300"
          >
            ⏪ 시작 -0.5s
          </button>
          <button
            onClick={() => setDraftStartTime(Math.min(draftEndTime - 1, draftStartTime + 0.5))}
            className="px-2 py-1 bg-[#1a2d4d] hover:bg-[#243a5c] rounded text-gray-300"
          >
            시작 +0.5s ⏩
          </button>
          <div className="flex-1" />
          <button
            onClick={() => setDraftEndTime(Math.max(draftStartTime + 1, draftEndTime - 0.5))}
            className="px-2 py-1 bg-[#1a2d4d] hover:bg-[#243a5c] rounded text-gray-300"
          >
            ⏪ 끝 -0.5s
          </button>
          <button
            onClick={() => setDraftEndTime(Math.min(duration, draftEndTime + 0.5))}
            className="px-2 py-1 bg-[#1a2d4d] hover:bg-[#243a5c] rounded text-gray-300"
          >
            끝 +0.5s ⏩
          </button>
        </div>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━ 탭 컴포넌트들 ━━━━━━━━━━━━

function TitlePanel({
  draftTitle,
  setDraftTitle,
  customization,
  updateCust,
  transcript,
  projectId,
  startTime,
  endTime,
  fallbackContext,
}: {
  draftTitle: string;
  setDraftTitle: (s: string) => void;
  customization: ClipCustomization;
  updateCust: (p: Partial<ClipCustomization>) => void;
  transcript?: Transcript | null;
  projectId?: string;
  startTime: number;
  endTime: number;
  fallbackContext?: string;
}) {
  const [suggestions, setSuggestions] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // transcript prop이 없으면 직접 fetch 로 폴백
  const [localTranscript, setLocalTranscript] = useState<Transcript | null>(null);

  useEffect(() => {
    if (transcript && transcript.segments && transcript.segments.length > 0) return;
    if (!projectId) return;
    let cancelled = false;
    fetch(`/api/projects/transcript?projectId=${projectId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Transcript | null) => {
        if (!cancelled && data && Array.isArray(data.segments)) {
          setLocalTranscript(data);
        }
      })
      .catch(() => { /* ignore */ });
    return () => { cancelled = true; };
  }, [transcript, projectId]);

  const effectiveTranscript: Transcript | null =
    (transcript && transcript.segments?.length ? transcript : null) ||
    (localTranscript && localTranscript.segments?.length ? localTranscript : null);

  // 클립 구간 스크립트 추출 (현재 상태)
  const inRangeSegs =
    effectiveTranscript?.segments.filter(
      (s) => s.end > startTime && s.start < endTime,
    ) ?? [];
  const scriptText = inRangeSegs.map((s) => s.text).join(' ').trim();
  const totalSegs = effectiveTranscript?.segments?.length ?? 0;

  async function suggestTitles() {
    setError(null);
    setLoading(true);
    try {
      const apiKey = getStoredApiKey();
      if (!apiKey) {
        throw new Error('API 키가 없습니다. 홈 화면에서 먼저 입력해주세요.');
      }
      // 시간 범위 매칭 텍스트 우선. 없으면 fallback context 사용
      let payload = scriptText;
      if (!payload) {
        if (totalSegs === 0) {
          throw new Error('스크립트가 로드되지 않았습니다. 잠시 후 다시 시도하거나 페이지를 새로고침해주세요.');
        }
        if (fallbackContext) {
          payload = fallbackContext;
        } else {
          throw new Error(
            `이 구간(${startTime.toFixed(1)}s~${endTime.toFixed(1)}s)에 매칭되는 스크립트가 없습니다. (전체 ${totalSegs}개 세그먼트 검색됨)`,
          );
        }
      }
      const res = await fetch('/api/clip/suggest-titles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ scriptText: payload }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || '추천 실패');
      }
      const data = (await res.json()) as { titles: string[] };
      setSuggestions(data.titles);
    } catch (err) {
      setError(err instanceof Error ? err.message : '추천 중 오류 발생');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2.5">
      {/* AI 제목 추천받기 */}
      <button
        onClick={suggestTitles}
        disabled={loading}
        className="w-full px-3 py-2 bg-gradient-to-r from-[#1C4D8D] to-[#4988C4] text-white rounded text-sm font-bold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
            추천 생성 중...
          </>
        ) : (
          <>✨ AI에게 제목 추천받기 (5개)</>
        )}
      </button>
      {/* 인식한 스크립트 미리보기 — AI가 무엇을 보고 분석할지 확인 */}
      <details className="bg-[#0a1428] border border-[#243a5c] rounded">
        <summary className="px-2 py-1.5 text-[10px] text-gray-400 cursor-pointer hover:text-gray-200 flex items-center justify-between">
          <span>
            📝 분석 대상 스크립트 ({scriptText ? scriptText.length : 0}자
            {totalSegs > 0 && `, ${inRangeSegs.length}/${totalSegs}개 구간`})
          </span>
          <span className="text-[9px] text-gray-600">접기/펴기</span>
        </summary>
        <div className="px-2 py-2 border-t border-[#243a5c] text-[11px] text-gray-300 leading-relaxed max-h-32 overflow-y-auto">
          {scriptText ? (
            scriptText
          ) : totalSegs === 0 ? (
            <span className="text-gray-500">
              스크립트가 아직 로드되지 않았습니다. (transcript={transcript === undefined ? 'undef' : transcript === null ? 'null' : 'empty'})
            </span>
          ) : (
            <span className="text-gray-500">
              이 구간({startTime.toFixed(1)}s~{endTime.toFixed(1)}s)에 매칭되는
              스크립트가 없습니다. {fallbackContext && '· 폴백 텍스트로 대체됨'}
            </span>
          )}
        </div>
      </details>
      {error && (
        <div className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/30 rounded px-2 py-1.5">
          {error}
        </div>
      )}
      {suggestions && suggestions.length > 0 && (
        <div className="space-y-1.5 bg-[#0a1428] border border-[#243a5c] rounded p-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-gray-500">
              제목을 클릭하면 적용됩니다
            </span>
            <button
              onClick={() => setSuggestions(null)}
              className="text-[10px] text-gray-500 hover:text-white"
            >
              ✕
            </button>
          </div>
          {suggestions.map((t, i) => (
            <button
              key={i}
              onClick={() => {
                setDraftTitle(t);
              }}
              className={`w-full text-left px-2.5 py-2 rounded text-sm hover:bg-[#1a2d4d] transition border ${
                draftTitle === t
                  ? 'bg-[#4988C4]/20 border-[#4988C4] text-white'
                  : 'border-transparent text-gray-200'
              }`}
              style={{ whiteSpace: 'pre-line', lineHeight: 1.35 }}
            >
              <span className="text-[10px] text-[#4988C4] font-bold mr-1.5">
                #{i + 1}
              </span>
              {t}
            </button>
          ))}
        </div>
      )}

      {/* 제목 텍스트는 위에 textarea로 */}
      <div>
        <label className="block text-[11px] text-gray-500 mb-1">제목</label>
        <textarea
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          rows={2}
          className="w-full px-3 py-2 bg-[#0a1428] border border-[#243a5c] rounded text-white text-sm focus:outline-none focus:border-[#4988C4] resize-none"
          placeholder="쇼츠 제목 입력"
        />
      </div>

      <Row label="폰트">
        <select
          value={customization.titleFontName}
          onChange={(e) => updateCust({ titleFontName: e.target.value })}
          className="w-full px-2.5 py-1.5 bg-[#0a1428] border border-[#243a5c] rounded text-white text-sm focus:outline-none focus:border-[#4988C4]"
        >
          {FONTS.map((f) => (
            <option key={f.name} value={f.name}>
              {f.label}
            </option>
          ))}
        </select>
      </Row>

      <Row label="사이즈">
        <NumberStepper
          value={customization.titleFontSize}
          onChange={(v) => updateCust({ titleFontSize: v })}
          min={8}
          max={500}
          step={2}
        />
      </Row>

      <Row label="색상">
        <CircleColorPicker
          value={customization.titleColor}
          onChange={(c) => updateCust({ titleColor: c })}
        />
      </Row>

      <Row label="굵게">
        <Toggle
          on={customization.titleBold}
          onChange={(v) => updateCust({ titleBold: v })}
        />
      </Row>

      {/* 위치 정렬 preset — 가운데는 좌우만, 위/아래는 Y만 */}
      <Row label="정렬">
        <div className="flex gap-1">
          <button
            onClick={() =>
              updateCust({
                titleY: 164,       // 레터박스 위 검정 띠 중앙
                titleYCrop: 200,   // 세로 크롭 영상 위
              })
            }
            className="flex-1 px-2 py-1 bg-[#11203d] hover:bg-[#1a2d4d] border border-[#243a5c] text-gray-200 rounded text-xs"
            title="위쪽으로 (X 위치는 유지)"
          >
            ⬆ 위
          </button>
          <button
            onClick={() =>
              updateCust({
                titleX: 540,       // 좌우 정중앙 (Y는 현재 그대로 유지)
                titleXCrop: 540,
              })
            }
            className="flex-1 px-2 py-1 bg-[#11203d] hover:bg-[#1a2d4d] border border-[#243a5c] text-gray-200 rounded text-xs"
            title="좌우 가운데 정렬 (Y 위치는 유지)"
          >
            ↔ 가운데
          </button>
          <button
            onClick={() =>
              updateCust({
                titleY: 1700,      // 레터박스 아래 검정 띠 중앙
                titleYCrop: 1660,  // 세로 크롭 영상 아래
              })
            }
            className="flex-1 px-2 py-1 bg-[#11203d] hover:bg-[#1a2d4d] border border-[#243a5c] text-gray-200 rounded text-xs"
            title="아래쪽으로 (X 위치는 유지)"
          >
            ⬇ 아래
          </button>
        </div>
      </Row>
    </div>
  );
}

function ChannelPanel({
  customization,
  updateCust,
}: {
  customization: ClipCustomization;
  updateCust: (p: Partial<ClipCustomization>) => void;
}) {
  return (
    <div className="space-y-2.5">
      <Row label="표시">
        <Toggle
          on={customization.channelEnabled}
          onChange={(v) => updateCust({ channelEnabled: v })}
        />
      </Row>
      {customization.channelEnabled && (
        <>
          <div>
            <label className="block text-[11px] text-gray-500 mb-1">
              채널명
            </label>
            <input
              value={customization.channelText}
              onChange={(e) => updateCust({ channelText: e.target.value })}
              className="w-full px-3 py-2 bg-[#0a1428] border border-[#243a5c] rounded text-white text-sm focus:outline-none focus:border-[#4988C4]"
              placeholder="예: 컨텐츠가 정답이다"
            />
          </div>
          <Row label="사이즈">
            <NumberStepper
              value={customization.channelFontSize}
              onChange={(v) => updateCust({ channelFontSize: v })}
              min={8}
              max={500}
              step={2}
            />
          </Row>
          <Row label="색상">
            <CircleColorPicker
              value={customization.channelColor}
              onChange={(c) => updateCust({ channelColor: c })}
            />
          </Row>
          <Row label="굵게">
            <Toggle
              on={customization.channelBold}
              onChange={(v) => updateCust({ channelBold: v })}
            />
          </Row>
          <Row label="폰트">
            <select
              value={customization.channelFontName}
              onChange={(e) => updateCust({ channelFontName: e.target.value })}
              className="w-full px-2.5 py-1.5 bg-[#0a1428] border border-[#243a5c] rounded text-white text-sm focus:outline-none focus:border-[#4988C4]"
            >
              {FONTS.map((f) => (
                <option key={f.name} value={f.name}>
                  {f.label}
                </option>
              ))}
            </select>
          </Row>
          {/* 위치 정렬 preset — 가운데는 좌우만, 위/아래는 Y만 */}
          <Row label="정렬">
            <div className="flex gap-1">
              <button
                onClick={() => updateCust({ channelY: 200 })}
                className="flex-1 px-2 py-1 bg-[#11203d] hover:bg-[#1a2d4d] border border-[#243a5c] text-gray-200 rounded text-xs"
                title="위쪽으로 (X 위치는 유지)"
              >
                ⬆ 위
              </button>
              <button
                onClick={() => updateCust({ channelX: 540 })}
                className="flex-1 px-2 py-1 bg-[#11203d] hover:bg-[#1a2d4d] border border-[#243a5c] text-gray-200 rounded text-xs"
                title="좌우 가운데 정렬 (Y 위치는 유지)"
              >
                ↔ 가운데
              </button>
              <button
                onClick={() => updateCust({ channelY: 1840 })}
                className="flex-1 px-2 py-1 bg-[#11203d] hover:bg-[#1a2d4d] border border-[#243a5c] text-gray-200 rounded text-xs"
                title="아래쪽으로 (X 위치는 유지)"
              >
                ⬇ 아래
              </button>
            </div>
          </Row>
        </>
      )}
    </div>
  );
}

function LayoutPanel({
  draftLayout,
  setDraftLayout,
  customization,
  updateCust,
  projectId,
}: {
  draftLayout: 'letterbox' | 'crop_vertical' | 'custom_background';
  setDraftLayout: (l: 'letterbox' | 'crop_vertical' | 'custom_background') => void;
  customization: ClipCustomization;
  updateCust: (p: Partial<ClipCustomization>) => void;
  projectId?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function handleBackgroundUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = ''; // 같은 파일 재선택 가능하도록 reset
    if (!f) return;
    if (!projectId) {
      setUploadError('프로젝트 ID가 없습니다.');
      return;
    }
    // 100MB 사전 체크 — 서버에서도 검증하지만 미리 안내
    if (f.size > 100 * 1024 * 1024) {
      setUploadError(`파일이 너무 큽니다 (${Math.round(f.size / 1024 / 1024)}MB). 최대 100MB.`);
      return;
    }
    // MIME 사전 체크
    const isImage = f.type.startsWith('image/');
    const isVideo = f.type.startsWith('video/');
    if (!isImage && !isVideo) {
      setUploadError('이미지(jpg/png/webp) 또는 영상(mp4/mov/webm)만 업로드 가능합니다.');
      return;
    }

    setUploading(true);
    setUploadError('');
    try {
      const fd = new FormData();
      fd.append('projectId', projectId);
      fd.append('file', f);
      const res = await fetch('/api/projects/upload-background', { method: 'POST', body: fd });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { path: string; kind: 'image' | 'video' };
      updateCust({ customBackgroundPath: data.path });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : '업로드 실패');
    } finally {
      setUploading(false);
    }
  }

  const bgFilename = customization.customBackgroundPath
    ? customization.customBackgroundPath.split(/[\\/]/).pop()
    : null;

  return (
    <div className="space-y-4">
      <Field label="레이아웃">
        <div className="space-y-2">
          <LayoutOption
            name="letterbox"
            label="레터박스 (16:9 영상 + 위아래 검정 띠)"
            selected={draftLayout === 'letterbox'}
            onSelect={() => setDraftLayout('letterbox')}
          />
          <LayoutOption
            name="crop_vertical"
            label="세로 크롭 (영상 전체 9:16 채움)"
            selected={draftLayout === 'crop_vertical'}
            onSelect={() => setDraftLayout('crop_vertical')}
          />
          <LayoutOption
            name="custom_background"
            label="배경 이미지/영상 (사용자가 업로드한 배경 위에 원본 영상 오버레이)"
            selected={draftLayout === 'custom_background'}
            onSelect={() => setDraftLayout('custom_background')}
          />
        </div>
      </Field>

      {/* custom_background 모드에서만 — 배경 파일 picker */}
      {draftLayout === 'custom_background' && (
        <div className="space-y-2.5 pt-2 border-t border-[#243a5c]">
          <div className="text-[11px] text-gray-500 -mb-1">
            이미지: jpg/png/webp · 영상: mp4/mov/webm · 최대 100MB
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm,video/x-matroska"
            onChange={handleBackgroundUpload}
            className="hidden"
          />
          <button
            type="button"
            disabled={uploading || !projectId}
            onClick={() => fileInputRef.current?.click()}
            className="w-full px-3 py-2 bg-[#1C4D8D] hover:bg-[#0F2854] text-white rounded text-xs transition disabled:opacity-50"
          >
            {uploading ? '업로드 중...' : (bgFilename ? '배경 파일 교체' : '배경 파일 선택')}
          </button>
          {bgFilename && (
            <div className="text-[11px] text-gray-400 break-all bg-[#0a1428] border border-[#243a5c] rounded px-2 py-1.5">
              현재: {bgFilename}
            </div>
          )}
          {uploadError && (
            <div className="text-[11px] text-red-400">{uploadError}</div>
          )}
          {!customization.customBackgroundPath && !uploading && (
            <div className="text-[11px] text-yellow-400/80">
              배경 파일을 업로드해야 이 모드가 작동합니다. 미선택 시 레터박스로 fallback됩니다.
            </div>
          )}
        </div>
      )}

      {/* 세로 크롭 모드에서만 — 배경 영상 zoom/pan */}
      {draftLayout === 'crop_vertical' && (
        <div className="space-y-2.5 pt-2 border-t border-[#243a5c]">
          <div className="text-[11px] text-gray-500 -mb-1">
            영상 화면에서 직접 드래그(이동) / 휠(확대)로도 조정 가능
          </div>
          <Row label="배경 줌">
            <NumberStepper
              value={Math.round(customization.bgZoom * 100)}
              onChange={(v) => updateCust({ bgZoom: Math.max(100, Math.min(500, v)) / 100 })}
              min={100}
              max={500}
              step={5}
            />
          </Row>
          <Row label="가로 X">
            <NumberStepper
              value={customization.bgOffsetX}
              onChange={(v) => updateCust({ bgOffsetX: v })}
              min={-540}
              max={540}
              step={10}
            />
          </Row>
          <Row label="세로 Y">
            <NumberStepper
              value={customization.bgOffsetY}
              onChange={(v) => updateCust({ bgOffsetY: v })}
              min={-960}
              max={960}
              step={10}
            />
          </Row>
          <button
            onClick={() => updateCust({ bgZoom: 1, bgOffsetX: 0, bgOffsetY: 0 })}
            className="w-full px-3 py-1.5 bg-[#1a2d4d] border border-[#243a5c] text-gray-300 rounded text-xs hover:bg-[#243a5c] transition"
          >
            🔄 배경 위치 초기화
          </button>
        </div>
      )}
    </div>
  );
}

function SubtitlePanel({
  customization,
  updateCust,
}: {
  customization: ClipCustomization;
  updateCust: (p: Partial<ClipCustomization>) => void;
}) {
  return (
    <div className="space-y-2.5">
      <Row label="표시">
        <Toggle
          on={customization.subtitleEnabled}
          onChange={(v) => updateCust({ subtitleEnabled: v })}
        />
      </Row>
      {customization.subtitleEnabled && (
        <>
          {/* 🔥 핵심: 사이즈 + 위치 — 가장 중요한 두 가지를 맨 위에 */}
          <Row label="사이즈">
            <NumberStepper
              value={customization.subtitleFontSize}
              onChange={(v) => updateCust({ subtitleFontSize: v })}
              min={20}
              max={300}
              step={2}
            />
          </Row>
          <Row label="위치 Y">
            <div className="flex items-center gap-2">
              <NumberStepper
                value={customization.subtitleY}
                onChange={(v) => updateCust({ subtitleY: v })}
                min={0}
                max={1920}
                step={10}
              />
              <span className="text-[10px] text-gray-500">
                / 1920 (위↑ 아래↓)
              </span>
            </div>
          </Row>
          <Row label="줄 길이">
            <div className="flex items-center gap-2">
              <NumberStepper
                value={customization.subtitleMaxCharsPerLine ?? 13}
                onChange={(v) => updateCust({ subtitleMaxCharsPerLine: v })}
                min={4}
                max={40}
                step={1}
              />
              <span className="text-[10px] text-gray-500">
                자/줄 (한 줄 최대 글자 수)
              </span>
            </div>
          </Row>
          <Row label="정렬">
            <div className="flex gap-1">
              <button
                onClick={() => updateCust({ subtitleY: 200 })}
                className="flex-1 px-2 py-1 bg-[#11203d] hover:bg-[#1a2d4d] border border-[#243a5c] text-gray-200 rounded text-xs"
                title="위쪽으로 (X 위치는 유지)"
              >
                ⬆ 위
              </button>
              <button
                onClick={() => updateCust({ subtitleX: 540 })}
                className="flex-1 px-2 py-1 bg-[#11203d] hover:bg-[#1a2d4d] border border-[#243a5c] text-gray-200 rounded text-xs"
                title="좌우 가운데 정렬 (Y 위치는 유지)"
              >
                ↔ 가운데
              </button>
              <button
                onClick={() => updateCust({ subtitleY: 1670 })}
                className="flex-1 px-2 py-1 bg-[#11203d] hover:bg-[#1a2d4d] border border-[#243a5c] text-gray-200 rounded text-xs"
                title="아래쪽으로 (X 위치는 유지)"
              >
                ⬇ 아래
              </button>
            </div>
          </Row>
          <Row label="굵게">
            <Toggle
              on={customization.subtitleBold}
              onChange={(v) => updateCust({ subtitleBold: v })}
            />
          </Row>
          <Row label="폰트">
            <select
              value={customization.subtitleFontName}
              onChange={(e) => updateCust({ subtitleFontName: e.target.value })}
              className="w-full px-2.5 py-1.5 bg-[#0a1428] border border-[#243a5c] rounded text-white text-sm focus:outline-none focus:border-[#4988C4]"
            >
              {FONTS.map((f) => (
                <option key={f.name} value={f.name}>
                  {f.label}
                </option>
              ))}
            </select>
          </Row>
          <Row label="글자색">
            <CircleColorPicker
              value={customization.subtitleColor}
              onChange={(c) => updateCust({ subtitleColor: c })}
            />
          </Row>
          <Row label="외곽선">
            <Toggle
              on={customization.subtitleOutlineEnabled}
              onChange={(v) => updateCust({ subtitleOutlineEnabled: v })}
            />
          </Row>
          {customization.subtitleOutlineEnabled && (
            <>
              <Row label="외곽선색">
                <CircleColorPicker
                  value={customization.subtitleOutlineColor}
                  onChange={(c) => updateCust({ subtitleOutlineColor: c })}
                />
              </Row>
              <Row label="외곽선 두께">
                <NumberStepper
                  value={customization.subtitleOutlineWidth}
                  onChange={(v) => updateCust({ subtitleOutlineWidth: v })}
                  min={1}
                  max={20}
                  step={1}
                />
              </Row>
            </>
          )}
        </>
      )}
    </div>
  );
}

// ━━━━━━━━━━━━ 작은 헬퍼들 ━━━━━━━━━━━━

// 액션 bar용 작은 버튼
function ActionBtn({
  onClick,
  disabled,
  title,
  children,
  variant = 'default',
}: {
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
  variant?: 'default' | 'primary';
}) {
  const cls =
    variant === 'primary'
      ? 'bg-[#1C4D8D] hover:bg-[#0F2854] text-white'
      : 'bg-[#11203d] hover:bg-[#1a2d4d] text-gray-200 border border-[#243a5c]';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`${cls} px-2.5 h-8 min-w-8 rounded text-sm font-medium disabled:opacity-30 disabled:cursor-not-allowed transition shrink-0 flex items-center justify-center`}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <div className="w-px h-6 bg-[#243a5c] mx-0.5 shrink-0" />;
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider">
        {label}
      </label>
      {children}
    </div>
  );
}

// 컴팩트 row 레이아웃: 좌측 라벨 + 우측 컨트롤
function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <label className="text-xs text-gray-400 w-12 shrink-0">{label}</label>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

// 숫자 입력 — 좌우 드래그 scrub + 직접 입력 + ▲▼ 보조 버튼
function NumberStepper({
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  const [scrub, setScrub] = useState<{ x: number; v: number } | null>(null);

  function clamp(v: number): number {
    let out = Math.round(v);
    if (typeof min === 'number') out = Math.max(min, out);
    if (typeof max === 'number') out = Math.min(max, out);
    return out;
  }

  useEffect(() => {
    if (!scrub) return;
    function onMove(e: MouseEvent) {
      if (!scrub) return;
      const dx = e.clientX - scrub.x;
      // 1px = step만큼 변화. shift 누르면 5배 가속, alt 누르면 1/5 정밀
      const factor = e.shiftKey ? 5 : e.altKey ? 0.2 : 1;
      onChange(clamp(scrub.v + dx * step * factor));
    }
    function onUp() {
      setScrub(null);
    }
    document.body.style.cursor = 'ew-resize';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrub, step, min, max]);

  // 화면에 표시되는 값은 정수
  const displayValue = Math.round(value);

  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        value={displayValue}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const n = parseInt(e.target.value, 10);
          if (!isNaN(n)) onChange(clamp(n));
        }}
        onMouseDown={(e) => {
          // input이 이미 포커스 상태면 텍스트 편집, 아니면 scrub 시작
          if (document.activeElement === e.currentTarget) return;
          e.preventDefault();
          setScrub({ x: e.clientX, v: displayValue });
        }}
        className="w-20 px-2 py-1 bg-[#0a1428] border border-[#243a5c] rounded text-white text-sm focus:outline-none focus:border-[#4988C4] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        style={{ cursor: scrub ? 'ew-resize' : 'ew-resize' }}
        title="좌우로 드래그해서 조정 (shift 5배, alt 1/5) · 클릭하면 직접 입력"
      />
      <div className="flex flex-col">
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onChange(clamp(displayValue + step))}
          className="px-1.5 leading-none text-gray-400 hover:text-white text-[10px]"
          aria-label="증가"
        >
          ▲
        </button>
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onChange(clamp(displayValue - step))}
          className="px-1.5 leading-none text-gray-400 hover:text-white text-[10px]"
          aria-label="감소"
        >
          ▼
        </button>
      </div>
    </div>
  );
}

// 작은 원형 색상 버튼들 (체크 마크 + 커스텀 컬러휠)
function CircleColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (hex: string) => void;
}) {
  return (
    <div className="flex gap-1.5 items-center flex-wrap">
      {PRESET_COLORS.map((c) => {
        const isSelected = value.toUpperCase() === c.hex.toUpperCase();
        const isLight = c.hex === 'FFFFFF' || c.hex === 'FFEB3B' || c.hex === 'B6FF59';
        return (
          <button
            key={c.hex}
            onClick={() => onChange(c.hex)}
            title={c.name}
            className={`w-7 h-7 rounded-full border-2 transition flex items-center justify-center ${
              isSelected ? 'border-[#4988C4]' : 'border-transparent'
            }`}
            style={{ backgroundColor: `#${c.hex}` }}
          >
            {isSelected && (
              <span
                className={`text-[12px] leading-none ${
                  isLight ? 'text-black' : 'text-white'
                }`}
              >
                ✓
              </span>
            )}
          </button>
        );
      })}
      <label
        className={`relative w-7 h-7 rounded-full cursor-pointer overflow-hidden border-2 ${
          PRESET_COLORS.some((c) => c.hex.toUpperCase() === value.toUpperCase())
            ? 'border-transparent'
            : 'border-[#4988C4]'
        }`}
        title="직접 선택"
        style={{
          background:
            'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)',
        }}
      >
        <input
          type="color"
          value={`#${value}`}
          onChange={(e) =>
            onChange(e.target.value.replace('#', '').toUpperCase())
          }
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
      </label>
    </div>
  );
}

function Toggle({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="relative inline-flex items-center h-6 w-12 rounded-full transition-colors duration-200 shrink-0"
      style={{ backgroundColor: on ? '#4988C4' : '#243a5c' }}
    >
      <span
        className="inline-block h-5 w-5 rounded-full bg-white shadow transition-transform duration-200"
        style={{ transform: `translateX(${on ? 24 : 2}px)` }}
      />
    </button>
  );
}

function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (hex: string) => void;
}) {
  return (
    <div className="flex gap-2 flex-wrap">
      {PRESET_COLORS.map((c) => (
        <button
          key={c.hex}
          onClick={() => onChange(c.hex)}
          title={c.name}
          className={`w-8 h-8 rounded border-2 transition ${
            value === c.hex
              ? 'border-[#4988C4] scale-110'
              : 'border-[#243a5c]'
          }`}
          style={{ backgroundColor: `#${c.hex}` }}
        />
      ))}
      <input
        type="color"
        value={`#${value}`}
        onChange={(e) => onChange(e.target.value.replace('#', '').toUpperCase())}
        className="w-8 h-8 rounded border-2 border-[#243a5c] bg-transparent cursor-pointer"
        title="직접 선택"
      />
    </div>
  );
}

function LayoutOption({
  name,
  label,
  selected,
  onSelect,
}: {
  name: string;
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left p-3 rounded-lg border-2 transition ${
        selected
          ? 'border-[#4988C4] bg-[#1C4D8D]/30 text-white'
          : 'border-[#243a5c] bg-[#0a1428] text-gray-400 hover:border-[#1a2d4d]'
      }`}
    >
      <div className="text-xs font-bold mb-0.5">
        {selected && '✓ '}
        {name === 'letterbox'
          ? '레터박스'
          : name === 'crop_vertical'
            ? '세로 크롭'
            : '배경 이미지/영상'}
      </div>
      <div className="text-[11px] text-gray-500">{label}</div>
    </button>
  );
}

// ━━━━━━━━━━━━ 오디오 파형 ━━━━━━━━━━━━
// fetch + decodeAudioData로 video의 오디오를 한 번만 분석하고 peaks 캐싱.
// videoSrc별로 module-level 캐시 사용 (같은 URL 다시 진입해도 재분석 X).
const waveformCache = new Map<string, number[]>();
const waveformPending = new Map<string, Promise<number[]>>();

async function analyzeWaveform(videoSrc: string, samples = 600): Promise<number[]> {
  if (waveformCache.has(videoSrc)) return waveformCache.get(videoSrc)!;
  if (waveformPending.has(videoSrc)) return waveformPending.get(videoSrc)!;
  const promise = (async () => {
    const res = await fetch(videoSrc);
    const buf = await res.arrayBuffer();
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    const audioBuf = await ctx.decodeAudioData(buf);
    const channel = audioBuf.getChannelData(0);
    // 영상 길이에 비례한 충분한 샘플 수 (최소 samples, 최대 채널 길이의 1/100)
    // → zoom 28× 까지 확대해도 픽셀당 여러 샘플이 매칭되도록
    const effectiveSamples = Math.min(
      Math.max(samples, Math.floor(audioBuf.duration * 200)), // 1초당 200 peaks
      Math.floor(channel.length / 64), // 채널 길이 한계
    );
    const blockSize = Math.floor(channel.length / effectiveSamples);
    const peaks: number[] = new Array(effectiveSamples);
    for (let i = 0; i < effectiveSamples; i++) {
      let max = 0;
      const start = i * blockSize;
      const end = Math.min(start + blockSize, channel.length);
      for (let j = start; j < end; j++) {
        const v = Math.abs(channel[j]);
        if (v > max) max = v;
      }
      peaks[i] = max;
    }
    // normalize: 95 percentile 기준 (극단치에 덜 민감)
    const sorted = [...peaks].sort((a, b) => a - b);
    const norm = sorted[Math.floor(sorted.length * 0.97)] || 0.0001;
    const normalized = peaks.map((p) => Math.min(1, p / norm));
    waveformCache.set(videoSrc, normalized);
    ctx.close();
    return normalized;
  })();
  waveformPending.set(videoSrc, promise);
  try {
    return await promise;
  } finally {
    waveformPending.delete(videoSrc);
  }
}

// 가로 슬라이더 — 클릭/드래그로 zoom 값 조절 (로그 스케일이라 1×~40× 사이가 자연스러움)
function ZoomSlider({
  zoom,
  onChange,
  min,
  max,
}: {
  zoom: number;
  onChange: (z: number) => void;
  min: number;
  max: number;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  function setFromClientX(clientX: number) {
    if (!barRef.current) return;
    const rect = barRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    // 로그 스케일: 좌측=min, 우측=max
    const v = min * Math.pow(max / min, pct);
    onChange(Math.max(min, Math.min(max, v)));
  }

  useEffect(() => {
    if (!dragging) return;
    function onMove(e: MouseEvent) {
      setFromClientX(e.clientX);
    }
    function onUp() {
      setDragging(false);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging]);

  const pct =
    Math.log(Math.max(min, zoom) / min) / Math.log(max / min);

  return (
    <div className="flex items-center gap-2 ml-2 select-none">
      <span className="text-[10px] text-gray-500">🔍</span>
      <div
        ref={barRef}
        onMouseDown={(e) => {
          e.preventDefault();
          setFromClientX(e.clientX);
          setDragging(true);
        }}
        className="relative w-32 h-2 bg-[#243a5c] rounded-full cursor-pointer hover:bg-[#2a4666] transition-colors"
        title="잡고 좌우로 드래그해서 확대/축소"
      >
        {/* 채워진 영역 */}
        <div
          className="absolute top-0 left-0 bottom-0 bg-[#4988C4]/40 rounded-full pointer-events-none"
          style={{ width: `${pct * 100}%` }}
        />
        {/* 핸들 */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 bg-[#4988C4] rounded-full border-2 border-white shadow pointer-events-none"
          style={{ left: `${pct * 100}%` }}
        />
      </div>
      <span className="text-[10px] text-gray-400 w-12 text-right">
        {Math.round(zoom * 100)}%
      </span>
      <button
        onClick={() => onChange(1)}
        className="text-[10px] text-gray-400 hover:text-white px-1.5 py-0.5 hover:bg-[#1a2d4d] rounded"
        title="전체 보기"
      >
        전체
      </button>
    </div>
  );
}

// 타임라인 상단 시간 눈금 (ruler) — zoom 레벨에 따라 자동 간격 조절
function TimelineRuler({ duration, zoom }: { duration: number; zoom: number }) {
  if (duration <= 0) return null;
  // visible per zoom 단위: 전체 duration이 zoom×100% 폭. zoom이 클수록 더 잘게.
  // 적절한 눈금 간격을 자동 계산: 화면당 약 8~12개의 눈금이 보이도록
  const visibleSeconds = duration / zoom;
  const candidates = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  const interval =
    candidates.find((c) => visibleSeconds / c <= 12) ?? 600;
  const ticks: number[] = [];
  for (let t = 0; t <= duration + 0.001; t += interval) ticks.push(t);

  function fmt(s: number): string {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return m + ':' + String(sec).padStart(2, '0');
  }

  return (
    <div
      className="relative h-5 border-b border-[#243a5c] bg-[#0a1428]"
      style={{ width: zoom * 100 + '%', minWidth: '100%' }}
    >
      {ticks.map((t) => {
        const pct = (t / duration) * 100;
        return (
          <div
            key={t}
            className="absolute top-0 bottom-0 flex flex-col items-start"
            style={{ left: pct + '%' }}
          >
            <div className="w-px h-2 bg-[#4988C4]/60" />
            <span className="text-[9px] text-gray-500 ml-1 leading-none mt-0.5 select-none">
              {fmt(t)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Waveform({ videoSrc }: { videoSrc: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [peaks, setPeaks] = useState<number[] | null>(() =>
    waveformCache.get(videoSrc) ?? null,
  );

  useEffect(() => {
    if (waveformCache.has(videoSrc)) {
      setPeaks(waveformCache.get(videoSrc)!);
      return;
    }
    let cancelled = false;
    analyzeWaveform(videoSrc, 2000) // 더 촘촘하게 분석
      .then((p) => {
        if (!cancelled) setPeaks(p);
      })
      .catch(() => {
        if (!cancelled) setPeaks(null);
      });
    return () => {
      cancelled = true;
    };
  }, [videoSrc]);

  // Canvas 렌더링 — DPR 보정 + ResizeObserver로 컨테이너 크기 변화 대응
  useEffect(() => {
    if (!peaks || peaks.length === 0) return;
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    function render() {
      const w = container!.clientWidth;
      const h = container!.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      canvas!.width = Math.max(1, Math.floor(w * dpr));
      canvas!.height = Math.max(1, Math.floor(h * dpr));
      canvas!.style.width = w + 'px';
      canvas!.style.height = h + 'px';
      const ctx = canvas!.getContext('2d');
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, h);
      const peaksLen = peaks!.length;
      const midY = h / 2;
      const samplesPerPx = peaksLen / w;

      // Path 방식으로 채우기 — 위/아래 대칭 envelope, 더 부드럽고 디테일 풍부
      ctx.beginPath();
      ctx.moveTo(0, midY);
      // 위쪽 envelope (좌→우)
      for (let x = 0; x < w; x++) {
        const start = Math.floor(x * samplesPerPx);
        const end = Math.max(start + 1, Math.floor((x + 1) * samplesPerPx));
        let maxP = 0;
        for (let i = start; i < end && i < peaksLen; i++) {
          if (peaks![i] > maxP) maxP = peaks![i];
        }
        const y = midY - maxP * h * 0.45;
        ctx.lineTo(x, y);
      }
      // 아래쪽 envelope (우→좌, 대칭)
      for (let x = w - 1; x >= 0; x--) {
        const start = Math.floor(x * samplesPerPx);
        const end = Math.max(start + 1, Math.floor((x + 1) * samplesPerPx));
        let maxP = 0;
        for (let i = start; i < end && i < peaksLen; i++) {
          if (peaks![i] > maxP) maxP = peaks![i];
        }
        const y = midY + maxP * h * 0.45;
        ctx.lineTo(x, y);
      }
      ctx.closePath();
      // 그라데이션 채우기 — 더 자세하고 부드러운 느낌
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, 'rgba(73, 136, 196, 0.65)');
      grad.addColorStop(0.5, 'rgba(73, 136, 196, 0.85)');
      grad.addColorStop(1, 'rgba(73, 136, 196, 0.65)');
      ctx.fillStyle = grad;
      ctx.fill();

      // 중앙 라인 (subtle)
      ctx.strokeStyle = 'rgba(73, 136, 196, 0.2)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, midY);
      ctx.lineTo(w, midY);
      ctx.stroke();
    }

    render();
    const ro = new ResizeObserver(render);
    ro.observe(container);
    return () => ro.disconnect();
  }, [peaks]);

  if (!peaks || peaks.length === 0) {
    return (
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span className="text-[10px] text-gray-600">파형 분석 중...</span>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none">
      <canvas ref={canvasRef} />
    </div>
  );
}
