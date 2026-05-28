/**
 * Phase 4 — Brand Profile 적용 helper.
 *
 * 활성화된 brand_profile의 로고/색상/폰트/CTA를 새 프로젝트의 ClipCustomization과
 * 자동 머지하는 순수 함수. ffmpeg-ops.ts는 손대지 않고 — 호출자에서 이 helper로
 * 적용 후 기존 흐름을 그대로 사용.
 */

import type { BrandProfile } from './db';

export interface BrandOverlayInput {
  titleFontName?: string;
  titleColor?: string;
  channelFontName?: string;
  channelText?: string;
  subtitleFontName?: string;
  subtitleColor?: string;
  brandLogoPath?: string;
  brandCtaText?: string;
  brandPrimaryColor?: string;
  brandSecondaryColor?: string;
  [key: string]: unknown;
}

function normalizeHex(c: string | null | undefined): string | undefined {
  if (!c) return undefined;
  const trim = c.trim();
  if (!trim) return undefined;
  return trim.startsWith('#') ? trim.slice(1).toUpperCase() : trim.toUpperCase();
}

export function applyBrandOverlay<T extends BrandOverlayInput>(
  customization: T,
  brand: BrandProfile | null,
  opts: { onlyEmpty?: boolean } = {},
): T {
  if (!brand) return customization;
  const onlyEmpty = opts.onlyEmpty ?? true;

  const merged: T = { ...customization };

  function set<K extends keyof T>(key: K, value: T[K] | undefined) {
    if (value === undefined) return;
    const current = merged[key];
    const isEmpty =
      current === undefined ||
      current === null ||
      (typeof current === 'string' && current.trim() === '');
    if (onlyEmpty && !isEmpty) return;
    merged[key] = value;
  }

  const primary = normalizeHex(brand.primary_color);
  const secondary = normalizeHex(brand.secondary_color);

  if (brand.font_name) {
    set('titleFontName' as keyof T, brand.font_name as T[keyof T]);
    set('channelFontName' as keyof T, brand.font_name as T[keyof T]);
    set('subtitleFontName' as keyof T, brand.font_name as T[keyof T]);
  }
  if (primary) {
    set('titleColor' as keyof T, primary as T[keyof T]);
  }
  if (secondary) {
    (merged as Record<string, unknown>).brandSecondaryColor = secondary;
  }
  if (brand.cta_text) {
    set('channelText' as keyof T, brand.cta_text as T[keyof T]);
    (merged as Record<string, unknown>).brandCtaText = brand.cta_text;
  }
  if (brand.logo_path) {
    (merged as Record<string, unknown>).brandLogoPath = brand.logo_path;
  }
  if (primary) {
    (merged as Record<string, unknown>).brandPrimaryColor = primary;
  }
  return merged;
}

export function applyActiveBrandToCustomization<T extends BrandOverlayInput>(
  customization: T,
  getActive: () => BrandProfile | null,
): T {
  const active = getActive();
  return applyBrandOverlay(customization, active, { onlyEmpty: true });
}
