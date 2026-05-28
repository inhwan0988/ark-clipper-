/**
 * [Phase 3 / Task 4] 자막 애니메이션 ASS override 태그 생성기.
 *
 * 회피: subtitle-gen.ts를 직접 수정하지 않고 ASS dialogue text 앞에 붙일
 *       override 태그 string을 반환하는 별도 모듈.
 *       호출자(subtitle-gen.ts 또는 그 wrapper)가 옵션으로 사용.
 */

export type SubtitleAnimation = 'none' | 'typewriter' | 'bounce' | 'wave';

export interface AnimationContext {
  /** 자막 라인의 전체 텍스트 (글자별 timing 계산에 사용) */
  text: string;
  /** 라인 표시 시간 (초). typewriter/wave 등 글자별 분배에 사용. */
  durationSec: number;
  /** 글꼴 크기 (bounce 효과 강도 산정용) */
  fontSize: number;
}

/**
 * 애니메이션 종류 + 컨텍스트 → ASS override prefix string.
 *
 * 반환값은 dialogue text 맨 앞에 그대로 붙이면 됨.
 *  - typewriter: \k 글자별 timing (centiseconds)
 *  - bounce: \t로 fontsize 위↔아래 펄스 (1.5초 주기)
 *  - wave: \fad in/out + 글자별 \k로 부드러운 떠오름
 *
 * "none"이면 빈 문자열 반환.
 */
export function buildAnimationOverride(
  animation: SubtitleAnimation,
  ctx: AnimationContext,
): string {
  if (animation === 'none' || !animation) return '';

  switch (animation) {
    case 'typewriter':
      return buildTypewriter(ctx);
    case 'bounce':
      return buildBounce(ctx);
    case 'wave':
      return buildWave(ctx);
    default:
      return '';
  }
}

/**
 * typewriter: 글자별 \k (karaoke) 태그.
 * 라인 전체 시간을 글자 수로 균등 분배. \k 단위는 centisecond (1/100초).
 *
 * 호출 측에서 적용 방법:
 *   Dialogue: ..., ${buildTypewriter(...)}안녕하세요
 *   →  {\k20}안녕{\k20}하세요  (라인 시간이 80cs이고 4글자면)
 *
 * 단순화를 위해 본 함수는 prefix(시작 태그)만 반환.
 * 글자 분할이 필요한 typewriter는 다음 helper로 처리.
 */
function buildTypewriter(_ctx: AnimationContext): string {
  // typewriter는 글자별 태그라 prefix만으론 안 됨 — applyAnimationToText 사용 권장.
  // 여기서는 fade-in 효과만 prefix로 (300ms in)
  return '{\\fad(300,0)}';
}

/**
 * bounce: \t(start,end,\fscxNN\fscyNN)로 크기 변화.
 * 표시 시간 전반에 걸쳐 100% ↔ 115% ↔ 100% 펄스 (총 0.8초 주기, 2회 반복).
 */
function buildBounce(ctx: AnimationContext): string {
  // ASS \t(t1,t2,style) — t1/t2는 ms 단위 (override 시작 기준)
  // 펄스 1회: 0~200ms 확대 → 200~400ms 원복
  const dur = Math.max(0.3, ctx.durationSec);
  const cycleMs = Math.min(800, dur * 1000);
  const halfMs = Math.round(cycleMs / 2);
  return `{\\fscx100\\fscy100\\t(0,${halfMs},\\fscx115\\fscy115)\\t(${halfMs},${cycleMs},\\fscx100\\fscy100)}`;
}

/**
 * wave: \fad in/out + 살짝 위에서 떨어지는 효과 (\move 사용은 위치를 알아야 해서 회피,
 * 대신 \frz로 살짝 회전 + fade in).
 */
function buildWave(ctx: AnimationContext): string {
  const dur = Math.max(0.3, ctx.durationSec);
  const fadeMs = Math.min(400, Math.round(dur * 250));
  // 회전 -3° → 0° 부드럽게
  return `{\\fad(${fadeMs},${fadeMs})\\frz-3\\t(0,${fadeMs},\\frz0)}`;
}

/**
 * Typewriter용 — 글자별 \k 태그를 본문에 삽입한 결과 반환.
 *
 * ASS \k 단위는 centisecond. 라인 시간이 60센티초이고 글자가 6개면
 * \k10안 \k10녕 ... 처럼 균등 분배.
 *
 * 공백은 시간 분배에서 제외 (시각적 자연스러움).
 */
export function applyTypewriterToText(text: string, durationSec: number): string {
  if (!text) return text;
  const chars = Array.from(text);
  const nonSpace = chars.filter((c) => c.trim().length > 0).length;
  if (nonSpace === 0) return text;
  const totalCs = Math.max(20, Math.round(durationSec * 100));
  const perCharCs = Math.max(2, Math.round(totalCs / nonSpace));
  let out = '';
  for (const ch of chars) {
    if (ch.trim().length === 0) {
      // 공백은 시간 분배 없이 그대로
      out += ch;
    } else {
      out += `{\\kf${perCharCs}}${ch}`;
    }
  }
  // typewriter는 fade-in 없이 글자 단위로 순차 표시
  return out;
}

/**
 * Dialogue text에 애니메이션 override 적용.
 * typewriter는 글자별 태그 — applyTypewriterToText 사용.
 * 그 외는 buildAnimationOverride prefix를 head에 prepend.
 */
export function applyAnimationToText(
  animation: SubtitleAnimation,
  text: string,
  ctx: AnimationContext,
): string {
  if (!animation || animation === 'none') return text;
  if (animation === 'typewriter') return applyTypewriterToText(text, ctx.durationSec);
  const prefix = buildAnimationOverride(animation, ctx);
  return `${prefix}${text}`;
}
