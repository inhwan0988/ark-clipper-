import type { PointSubtitle, SoundEffect } from "./types";

/**
 * 효과음 라이브러리 (초기 셋업 — 카테고리별 sample).
 *
 * 실제 launch 시 royalty-free 음원으로 교체 필요.
 * Freesound.org, Pixabay 또는 자체 큐레이션 음원.
 *
 * 현재 placeholder URL들은 빈 mp3로 채워두고, 추후 실제 음원 host로 교체.
 */
export const SOUND_LIBRARY: SoundEffect[] = [
  // Pop — 가벼운 강조 (포인트 자막 등장)
  {
    id: "pop-1",
    name: "Pop (가벼움)",
    category: "pop",
    duration: 0.3,
    url: "/sounds/pop-light.mp3",
  },
  {
    id: "pop-2",
    name: "Pop (밝음)",
    category: "pop",
    duration: 0.4,
    url: "/sounds/pop-bright.mp3",
  },
  // Ding — 결정적 강조 (핵심 메시지)
  {
    id: "ding-1",
    name: "Ding (clean)",
    category: "ding",
    duration: 0.5,
    url: "/sounds/ding-clean.mp3",
  },
  {
    id: "ding-2",
    name: "Ding (chime)",
    category: "ding",
    duration: 0.7,
    url: "/sounds/ding-chime.mp3",
  },
  // Whoosh — 전환 (구간 이동)
  {
    id: "woosh-1",
    name: "Whoosh (fast)",
    category: "woosh",
    duration: 0.5,
    url: "/sounds/woosh-fast.mp3",
  },
  {
    id: "woosh-2",
    name: "Whoosh (slow)",
    category: "woosh",
    duration: 0.8,
    url: "/sounds/woosh-slow.mp3",
  },
  // Impact — 충격적 사실 (큰 숫자 등)
  {
    id: "impact-1",
    name: "Impact (bass)",
    category: "impact",
    duration: 0.6,
    url: "/sounds/impact-bass.mp3",
  },
  {
    id: "impact-2",
    name: "Impact (boom)",
    category: "impact",
    duration: 0.8,
    url: "/sounds/impact-boom.mp3",
  },
  // Comic — 예능/유머 (가벼운 반전)
  {
    id: "comic-1",
    name: "Comic (boing)",
    category: "comic",
    duration: 0.5,
    url: "/sounds/comic-boing.mp3",
  },
  // Applause — 인정/축하
  {
    id: "applause-1",
    name: "Applause (short)",
    category: "applause",
    duration: 1.5,
    url: "/sounds/applause-short.mp3",
  },
  // Transition — 챕터 전환
  {
    id: "transition-1",
    name: "Transition (smooth)",
    category: "transition",
    duration: 1,
    url: "/sounds/transition-smooth.mp3",
  },
];

/**
 * style + soundCategory hint를 받아 적합한 효과음 1개 매칭.
 */
export function matchSoundEffect(
  style: PointSubtitle["style"],
  hintCategory?: string,
): SoundEffect | null {
  // 1순위: hint category가 있으면 그것
  if (hintCategory) {
    const matched = SOUND_LIBRARY.find((s) => s.category === hintCategory);
    if (matched) return matched;
  }
  // 2순위: style 기반 default 매칭
  const styleMap: Record<NonNullable<PointSubtitle["style"]>, string> = {
    shock: "impact",
    emphasis: "ding",
    callout: "pop",
    punchline: "comic",
  };
  const cat = style ? styleMap[style] : "pop";
  return SOUND_LIBRARY.find((s) => s.category === cat) ?? SOUND_LIBRARY[0];
}

/**
 * 사용자가 카테고리로 직접 효과음 변경할 때 후보 list.
 */
export function getSoundsByCategory(category: SoundEffect["category"]): SoundEffect[] {
  return SOUND_LIBRARY.filter((s) => s.category === category);
}

export const SOUND_CATEGORY_LABELS: Record<SoundEffect["category"], string> = {
  pop: "Pop (가벼운 강조)",
  ding: "Ding (결정적 강조)",
  woosh: "Whoosh (전환)",
  impact: "Impact (충격 사실)",
  comic: "Comic (예능/유머)",
  applause: "Applause (인정/축하)",
  transition: "Transition (챕터 전환)",
};
