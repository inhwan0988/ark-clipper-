import Anthropic from '@anthropic-ai/sdk';
import { emitProgress } from './progress-bus';
import { updateProject, getProjectPaths } from './db';
import { createWithFallback } from './claude-models';
import fs from 'fs';
import type { Transcript, TranscriptSegment, HookSuggestion } from '@/types';

function buildSystemPrompt(clipCount: number): string {
  return `당신은 100만 조회수 한국 유튜브 쇼츠를 100개 이상 만든 카피라이팅 최고 전문가입니다.
영상 한 편당 후킹 제목 하나가 조회수의 80%를 결정한다는 사실을 잘 알고 있습니다.
**약한 제목은 절대 만들지 않습니다.** 모든 제목은 클릭하지 않으면 손해 보는 느낌이어야 합니다.

## 🚨 가장 중요한 규칙 (절대 위반 금지) — 시간 ↔ 제목 매칭

**title은 반드시 해당 start_time ~ end_time 구간에 실제로 등장하는 내용을 기반으로 작성해야 합니다.**

다른 구간의 내용으로 제목 만드는 것 절대 금지. 시간 구간을 먼저 정확히 정한 다음,
**그 구간 안의 transcript 텍스트만 보고** 제목을 만드세요.

검증을 위해 각 후보마다 **quote 필드**를 반드시 포함:
- quote: 해당 start_time ~ end_time 구간의 transcript에서 가장 핵심적인 한 문장을 **정확히 그대로 인용** (10~40자)
- quote는 반드시 그 시간 구간 안에 실제 등장해야 함 (transcript의 한 문장을 거의 그대로 복사)
- title은 이 quote와 의미가 일치해야 함 (다른 구간 내용이면 안 됨)

## 후킹 구간 기준:
1. **강한 오프닝**: **클립의 맨 첫 문장(첫 3~5초)이 그 자체로 후킹**이어야 함 — 시청자가 영상 본문을 모른 채로 들어도 "어? 뭐야?" 싶은 발화
2. **완결된 미니 스토리**: 30-90초 안에 기승전결이 있는 자기완결적 내용 — 클립 안에서 후킹 → 전개 → 결론까지 다 들어있어야
3. **감정 피크**: 유머, 놀라움, 인사이트, "아하!" 순간
4. **반전 모먼트**: 한국 시청자가 반응하는 반전이 있는 부분
5. **실용 팁**: 맥락 없이도 단독으로 가치가 있는 실용적 조언
6. **공유 가능한 문장**: 인용하거나 공유하고 싶은 강력한 한 마디

## 🎬 자르는 타이밍 규칙 (절대 위반 금지)

**start_time과 end_time은 반드시 transcript의 한 segment의 시작 시간/종료 시간에 맞춰야 합니다.**

- ❌ 잘못된 예: 12.7초에 시작 (그 시점에 누가 말을 하는 중이라면 말 중간이 잘림)
- ✅ 올바른 예: 12.3초에 시작 (transcript에 [12.3 - 14.5] "..." 처럼 segment 시작점이 있을 때)

**클립의 첫 문장이 후킹 그 자체여야 합니다.**
- 시청자가 클립 첫 3초에 듣는 말이 곧 후킹 메시지여야 함
- 빌드업/문맥 설명으로 시작하면 안 됨 — 강한 한 마디로 시작
- **quote는 가능하면 클립의 첫 segment(즉 start_time 근처)에 위치**해야 함

**클립의 마지막은 문장이 끝나는 segment의 end_time이어야 합니다.**
- 말 중간에서 자르지 말 것
- 결론/마무리 멘트로 끝나면 가장 좋음

## 규칙:
- **각 클립의 길이는 반드시 최소 30초 이상** (절대 30초 미만 금지)
- 각 클립의 길이는 최대 90초까지 (90초 초과 금지)
- 첫 3초가 반드시 주의를 끌어야 함 (쇼츠 알고리즘에 매우 중요)
- 문장이나 생각 중간에서 자르지 말 것 (transcript segment 경계 준수)
- 주변 영상 맥락 없이도 이해 가능해야 함
- **정확히 ${clipCount}개의 후보**만 반환 (가장 강력한 것 위주, 신뢰도 순 정렬)

## 🔥 후킹 제목 작성 규칙

### 1단계 평가 기준 — 모든 제목은 다음 4가지를 통과해야 합니다:

① **quote의 내용과 의미가 일치**하는가? (가장 중요 — 다른 구간 내용 X)
② **"클릭 안 하면 손해" 감정**이 느껴지는가? (단순 정보 X)
③ **3초 안에 본능적으로 호기심**이 자극되는가?
④ **20자 이내**인가?

이 중 하나라도 NO면 다시 작성. 절대 타협하지 말 것.

### 어투 규칙 (필수)
- ✅ **~니다 / ~합니다 / ~입니다 / ~세요 체로 마무리** (격식 + 신뢰감)
- ✅ 또는 **명사 종결** (~방법, ~이유, ~비법, ~진실, ~결과, ~정체, ~순간)
- ❌ **~음, ~슴, ~함, ~임 같은 음슴체 절대 금지** (성의 없어 보임)
- ❌ ~다 (반말 종결) 금지

### 🎯 제목 강화 체크리스트 (모든 제목 작성 후 자가검증)

**A. 첫 단어가 강해야 한다 (가장 중요)**
- ✅ "충격", "역대급", "절대", "이거", "100만", "3가지", "왜", "결국", "사실"
- ❌ "오늘", "저는", "여러분", "안녕하세요" 같은 약한 시작어

**B. 숫자/수치를 우선 포함 (가능하면 항상)**
- ✅ "100만원 모은 비법", "3가지만 지키세요", "5분 만에 끝납니다", "1년 후 결과"
- 숫자 = 구체성 + 신뢰 + 클릭률 +30%

**C. 호기심 갭(curiosity gap) — 답을 숨길 것**
- ✅ "이 한 마디로 끝났습니다" (한 마디가 뭔지 궁금)
- ❌ "긍정적으로 생각하면 됩니다" (답이 다 나와 있음)

**D. 감정 트리거 (택1)**
- 놀라움: "말도 안 됨", "진짜로?", "실화입니다"
- 위기감: "이거 모르면 손해", "절대 하지 마세요"
- 결과 폭로: "결국 ○○됐습니다", "이렇게 끝났어요"
- 비밀: "○○만 아는 진실", "사실은 이거였어요"

**E. quote의 핵심 insight를 한 줄로 압축**
- transcript에서 "가장 인상 깊은 한 마디"가 곧 클립의 메시지
- 그 메시지를 위 패턴 중 하나로 포장해 제목으로

**F. 길이 13~20자 (너무 짧으면 약함, 너무 길면 잘림)**

### 검증된 후킹 패턴 (다음 중 반드시 1개 이상 강하게 적용)

**Tier S — 가장 강력 (최우선 적용)**

1. **부정/위험 경고** — "안 하면 손해" 감정
   - "이거 모르면 평생 후회합니다"
   - "절대 ○○ 하지 마세요"

2. **충격/극단 표현** — 본능적 호기심 자극
   - "충격 실화입니다"
   - "역대급 ○○입니다"

3. **결과 폭로** — 결말부터 공개
   - "결국 ○○ 됐습니다"
   - "이렇게 ○○ 만들었습니다"

**Tier A — 강력**

4. **숫자 활용** — 구체성 + 신뢰
   - "3가지만 지키면 됩니다"
   - "100명 중 1명만 압니다"

5. **비밀/내부 정보** — 독점 정보 느낌
   - "○○만 아는 진실"
   - "사실은 이거였습니다"

6. **질문형** — 답을 알고 싶게
   - "왜 다들 실패할까요?"

### ✅ 좋은 제목 예시

**[quote 일치]**
- quote: "광고비 한 푼도 안 쓰고 100만 조회수 나왔어요"
  → title: "0원으로 100만 본 영상" ✅ (quote와 의미 일치)

**[잘못된 예 — quote 불일치]**
- quote: "광고비 한 푼도 안 쓰고 100만 조회수 나왔어요"
  → title: "유튜브 알고리즘의 비밀" ❌ (다른 내용)

### 주의사항
- **낚시 금지** — quote와 동떨어진 자극은 안 됨
- **20자를 초과하면 안 됨** (한글 + 공백 모두 포함)
- 영상마다 다른 패턴 사용 (모든 클립이 같은 패턴이면 단조로움)

## 출력 형식 (JSON 배열, 정확히 ${clipCount}개):
각 항목에 포함할 필드:
- start_time: 시작 시간(초)
- end_time: 종료 시간(초)
- quote: 해당 시간 구간의 핵심 한 문장 인용 (transcript에서 정확히 복사, 10~40자)
- title: 한국어 쇼츠 제목 (quote 기반, 후킹 패턴 적용, 20자 이내)
- reason: 이 구간이 왜 후킹되는지 + 사용한 제목 패턴(Tier + 번호) 명시
- confidence: 0-1 사이 확신도
- suggested_hashtags: 관련 한국어 해시태그 3-5개`;
}

export async function analyzeHooks(
  projectId: string,
  apiKey: string,
  clipCount: number = 6,
): Promise<HookSuggestion[]> {
  if (!apiKey || !apiKey.trim()) {
    throw new Error('Anthropic API 키가 설정되지 않았습니다. 홈 화면에서 API 키를 입력해주세요.');
  }
  const targetCount = Math.max(1, Math.min(10, Math.round(clipCount)));
  // maxRetries 5 + 5분 timeout — 일시적 네트워크/5xx 에러 자동 재시도.
  const client = new Anthropic({ apiKey: apiKey.trim(), maxRetries: 5, timeout: 300_000 });
  const pp = getProjectPaths(projectId);

  updateProject(projectId, { status: 'analyzing' });
  emitProgress({
    projectId,
    step: 'analyze',
    status: 'running',
    progress: 50,
    message: 'AI 분석 중...',
  });

  const transcript: Transcript = JSON.parse(
    fs.readFileSync(pp.transcript, 'utf-8')
  );

  const transcriptText = transcript.segments
    .map((seg) => `[${formatTime(seg.start)} - ${formatTime(seg.end)}] ${seg.text}`)
    .join('\n');

  let response;
  try {
    response = await createWithFallback(client, {
      max_tokens: 4096,
      temperature: 1.0,
      system: buildSystemPrompt(targetCount),
      messages: [
        {
          role: 'user',
          content: `다음은 유튜브 영상의 전사 텍스트입니다. 쇼츠로 만들기 좋은 후킹 구간을 찾아주세요.\n\n영상 길이: ${formatTime(transcript.duration)}\n\n전사:\n${transcriptText}\n\n⚠️ 반드시 지켜야 할 조건:\n1. 정확히 ${targetCount}개의 후킹 구간만 선택\n2. 각 구간은 반드시 30초 이상, 90초 이하\n3. **quote는 해당 start_time ~ end_time 구간 안에 실제로 등장하는 transcript 문장을 정확히 인용**\n4. **title은 quote와 의미가 일치하는 후킹 카피** (다른 구간 내용 절대 금지)\n5. 모든 제목은 Tier S 또는 Tier A 패턴 사용\n6. JSON 배열만 출력`,
        },
      ],
    });
  } catch (err) {
    // Anthropic SDK 에러 분류 → 사용자 친화 메시지
    const e = err as { status?: number; message?: string };
    console.error('[claude] Anthropic API error:', e.status, e.message);
    if (e.status === 401) {
      throw new Error('Anthropic API 키가 잘못되었습니다. 우상단 설정에서 다시 확인해주세요.');
    }
    if (e.status === 429) {
      throw new Error('Anthropic 사용량 한도에 도달했어요. 잠시 후 다시 시도하거나 console.anthropic.com에서 결제 정보를 확인해주세요.');
    }
    if (e.status === 529) {
      throw new Error('Anthropic 서버가 과부하 상태입니다. 잠시 후 다시 시도해주세요.');
    }
    if (typeof e.status === 'number' && e.status >= 500) {
      throw new Error('Anthropic 서버에 일시적 문제가 있어요. 잠시 후 다시 시도해주세요.');
    }
    throw new Error(`AI 분석 중 오류가 발생했습니다: ${e.message || '알 수 없는 오류'}`);
  }

  const text = response.content[0].type === 'text' ? response.content[0].text : '';

  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error('AI 분석 응답을 해석하지 못했어요. 다시 시도해주세요.');
  }

  const rawHooks: HookSuggestion[] = JSON.parse(jsonMatch[0]);

  // 1차: 길이 조정 (30~90초 enforce)
  const lengthAdjusted = rawHooks
    .filter((h) => h.start_time < h.end_time)
    .map((h) => {
      let start = h.start_time;
      let end = h.end_time;
      const len = end - start;
      if (len < 30) {
        const need = 30 - len;
        start = Math.max(0, start - need / 2);
        end = Math.min(transcript.duration, end + need / 2);
        if (end - start < 30) {
          if (start === 0) end = Math.min(transcript.duration, start + 30);
          else start = Math.max(0, end - 30);
        }
      }
      if (end - start > 90) end = start + 90;
      return { ...h, start_time: start, end_time: end };
    })
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));

  // 2차: quote 매칭으로 시간 구간 강제 정렬 (quote가 그 구간에 실제 있어야)
  //      매칭 실패 시 quote 위치 기준으로 windowing
  const quoteAligned = lengthAdjusted.map((h) => {
    if (!h.quote) return h;
    const quoteNormalized = normalizeForMatch(h.quote);
    if (!quoteNormalized || quoteNormalized.length < 4) return h;

    // 현재 구간 내 transcript 합본
    const inRangeText = transcript.segments
      .filter((seg) => seg.end > h.start_time && seg.start < h.end_time)
      .map((s) => s.text)
      .join(' ');
    if (normalizeForMatch(inRangeText).includes(quoteNormalized)) return h;

    // 안 맞으면 전체에서 quote 위치 찾기
    const matched = transcript.segments.find((seg) =>
      normalizeForMatch(seg.text).includes(quoteNormalized),
    );
    if (!matched) return h; // Claude 환각 추정 → 그대로 유지

    // quote가 클립 시작 근처에 오도록 윈도우 설정 (첫 5초 안에 quote)
    // quote segment 시작점 = 클립 시작점 - 2초 (약간 여유)
    const targetStart = Math.max(0, matched.start - 2);
    const targetEnd = Math.min(
      transcript.duration,
      targetStart + Math.max(30, h.end_time - h.start_time),
    );
    return { ...h, start_time: targetStart, end_time: targetEnd };
  });

  // 3차: transcript segment 경계로 snap — 말 중간 절단 방지
  const boundarySnapped = quoteAligned.map((h) => {
    const snappedStart = snapToSegmentStart(h.start_time, transcript);
    const snappedEnd = snapToSegmentEnd(h.end_time, transcript);
    let start = snappedStart;
    let end = snappedEnd;
    // snap 결과 start >= end가 되거나 길이 < 30초면 안전하게 확장
    if (end - start < 30) {
      const extEnd = extendToReachLength(start, 30, transcript);
      end = Math.min(transcript.duration, extEnd);
    }
    // 그래도 end <= start면 (transcript 끝 근처) start를 뒤로 당김
    if (end - start < 5) {
      start = Math.max(0, end - 30);
    }
    if (end - start > 90) {
      end = start + 90;
    }
    return { ...h, start_time: start, end_time: end };
  });

  // 최종 검증: 길이 < 15초인 hook은 제외 (의미 없는 클립 방지)
  // + start_time, end_time 유효성 재검증
  const MIN_HOOK_LEN = 15;
  const validHooks = boundarySnapped.filter((h) => {
    const len = h.end_time - h.start_time;
    if (!isFinite(h.start_time) || !isFinite(h.end_time)) return false;
    if (h.start_time < 0 || h.end_time > transcript.duration + 0.1) return false;
    if (len < MIN_HOOK_LEN) {
      console.warn(
        `[analyzer] hook skipped — length too short (${len.toFixed(1)}s): "${h.title}" @ ${h.start_time.toFixed(1)}~${h.end_time.toFixed(1)}`,
      );
      return false;
    }
    if (!h.title || h.title.trim().length < 2) {
      console.warn(`[analyzer] hook skipped — empty title @ ${h.start_time.toFixed(1)}~${h.end_time.toFixed(1)}`);
      return false;
    }
    return true;
  });

  let hooks = validHooks.slice(0, targetCount);

  // [Phase 3 / Task 1] Virality Score — best-effort 병렬 계산
  try {
    emitProgress({
      projectId,
      step: 'analyze',
      status: 'running',
      progress: 80,
      message: 'Virality 점수 계산 중...',
    });
    const viralities = await Promise.all(
      hooks.map((h) =>
        calculateViralityScore(h, transcript, apiKey).catch((e) => {
          console.warn('[virality] hook scoring failed:', e instanceof Error ? e.message : e);
          return null;
        }),
      ),
    );
    hooks = hooks.map((h, i) => {
      const v = viralities[i];
      if (!v) return h;
      return {
        ...h,
        virality_score: v.score,
        virality_reasons: v.reasons,
        predicted_reach: v.predictedReach,
      };
    });
  } catch (e) {
    console.warn('[virality] batch failed (non-fatal):', e instanceof Error ? e.message : e);
  }

  fs.writeFileSync(pp.hooks, JSON.stringify(hooks, null, 2), 'utf-8');

  emitProgress({
    projectId,
    step: 'analyze',
    status: 'complete',
    progress: 100,
    message: `AI 분석 완료 - ${hooks.length}개 후킹 구간 발견`,
  });

  updateProject(projectId, { status: 'analyzed' });
  return hooks;
}

/**
 * 한글/영문 텍스트 매칭을 위한 정규화.
 * - 공백, 문장부호, 영문 케이스 제거
 */
function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s.,!?;:'"()[\]{}<>。、，！？]/g, '')
    .trim();
}

/**
 * 주어진 시간을 가장 가까운 segment의 start 시간으로 snap.
 * 우선순위: 해당 시점 이전에 있는 segment 시작(0~2초 이내 가까운 것), 없으면 가장 가까운 것.
 */
function snapToSegmentStart(time: number, transcript: Transcript): number {
  if (transcript.segments.length === 0) return time;
  // 같거나 이전 시간 중 가장 가까운 segment.start
  let bestBefore = -1;
  let bestBeforeDist = Infinity;
  let bestAny = transcript.segments[0].start;
  let bestAnyDist = Math.abs(transcript.segments[0].start - time);
  for (const seg of transcript.segments) {
    const dist = Math.abs(seg.start - time);
    if (seg.start <= time + 0.3 && dist < bestBeforeDist) {
      bestBefore = seg.start;
      bestBeforeDist = dist;
    }
    if (dist < bestAnyDist) {
      bestAny = seg.start;
      bestAnyDist = dist;
    }
  }
  // 2초 이내에 이전 segment 시작이 있으면 그쪽 사용 (말 중간 안 자르기)
  if (bestBefore >= 0 && bestBeforeDist <= 2.0) return bestBefore;
  return bestAny;
}

/**
 * 주어진 시간을 가장 가까운 segment의 end 시간으로 snap.
 * 우선순위: 해당 시점 이후에 끝나는 segment.end (말이 끝난 뒤로 자르기).
 */
function snapToSegmentEnd(time: number, transcript: Transcript): number {
  if (transcript.segments.length === 0) return time;
  let bestAfter = -1;
  let bestAfterDist = Infinity;
  let bestAny = transcript.segments[transcript.segments.length - 1].end;
  let bestAnyDist = Math.abs(bestAny - time);
  for (const seg of transcript.segments) {
    const dist = Math.abs(seg.end - time);
    if (seg.end >= time - 0.3 && dist < bestAfterDist) {
      bestAfter = seg.end;
      bestAfterDist = dist;
    }
    if (dist < bestAnyDist) {
      bestAny = seg.end;
      bestAnyDist = dist;
    }
  }
  // 2초 이내에 이후 segment 끝이 있으면 그쪽 사용 (문장 끝까지 포함)
  if (bestAfter >= 0 && bestAfterDist <= 2.0) return bestAfter;
  return bestAny;
}

/**
 * start로부터 최소 minLen초가 되도록 다음 segment의 end로 확장.
 */
function extendToReachLength(start: number, minLen: number, transcript: Transcript): number {
  const target = start + minLen;
  for (const seg of transcript.segments) {
    if (seg.end >= target) return seg.end;
  }
  return transcript.segments.length > 0
    ? transcript.segments[transcript.segments.length - 1].end
    : target;
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// [Phase 3 / Task 1] Virality Score 계산
// ─────────────────────────────────────────────────────────────────────────────

export interface ViralityResult {
  score: number;                                  // 0-100
  reasons: string[];                              // 한국어 짧은 근거 1~3개
  predictedReach: 'low' | 'medium' | 'high';      // <40 / 40-70 / >70
}

/**
 * 단일 hook + 해당 클립 구간의 transcript 일부를 Claude에 넘겨
 * "예상 도달 점수"를 0-100으로 산정. Heuristic baseline + Claude AI 결합.
 *
 *  - score: hook strength(40) + 길이 적정성(20, 45~75초 최적) + 감정 강도(40)
 *  - reasons: 점수 근거 짧은 한국어 1~3개
 *  - predictedReach: <40 low / 40~70 medium / >70 high
 *
 * 비용: 1 hook당 ~400 토큰. analyzeHooks가 결과를 hook 객체에 캐시.
 */
export async function calculateViralityScore(
  hook: HookSuggestion,
  transcript: Transcript,
  apiKey: string,
): Promise<ViralityResult> {
  const lenSec = hook.end_time - hook.start_time;
  let lenScore = 0;
  if (lenSec >= 45 && lenSec <= 75) lenScore = 30;
  else if (lenSec >= 30 && lenSec <= 90) lenScore = 22;
  else lenScore = 10;
  const baseScore = Math.round(lenScore + (hook.confidence ?? 0.5) * 50);

  if (!apiKey || !apiKey.trim()) {
    const score = Math.max(0, Math.min(100, baseScore));
    return {
      score,
      reasons: ['휴리스틱(길이+신뢰도) 기반 추정 점수입니다.'],
      predictedReach: score < 40 ? 'low' : score > 70 ? 'high' : 'medium',
    };
  }

  const inRange = transcript.segments
    .filter((seg) => seg.end > hook.start_time && seg.start < hook.end_time)
    .map((s) => s.text)
    .join(' ')
    .slice(0, 700);

  const client = new Anthropic({ apiKey: apiKey.trim(), maxRetries: 2, timeout: 60_000 });
  const systemPrompt = `당신은 한국 유튜브 쇼츠 성과를 예측하는 분석가입니다.
주어진 쇼츠 후보(제목 + 대사)에 대해 0-100 점수를 매깁니다.

평가 기준 (가중치):
1. Hook strength (40점) — 첫 3초 임팩트, 호기심 자극, 클릭 유발
2. 길이 적정성 (20점) — 45~75초가 최적
3. 감정 강도 (40점) — 놀라움/유머/충격/공감/실용 가치

JSON만 출력:
{
  "score": <0-100 정수>,
  "reasons": [<짧은 한국어 근거 1~3개, 각 30자 이내>],
  "predictedReach": "low" | "medium" | "high"
}`;

  try {
    const response = await createWithFallback(client, {
      max_tokens: 400,
      temperature: 0.3,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `제목: ${hook.title}\n길이: ${lenSec.toFixed(1)}초\n신뢰도: ${(hook.confidence ?? 0).toFixed(2)}\n대사:\n${inRange || '(없음)'}\n\nJSON만 출력.`,
      }],
    });
    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('no json');
    const parsed = JSON.parse(jsonMatch[0]) as Partial<ViralityResult> & { score?: unknown };
    const rawScore = typeof parsed.score === 'number'
      ? parsed.score
      : typeof parsed.score === 'string' ? parseFloat(parsed.score as string) : NaN;
    const score = Math.max(0, Math.min(100, Math.round(isFinite(rawScore) ? rawScore : baseScore)));
    const reasons = Array.isArray(parsed.reasons)
      ? (parsed.reasons.filter((r) => typeof r === 'string') as string[]).slice(0, 3)
      : ['AI 평가'];
    const predictedReach: 'low' | 'medium' | 'high' =
      parsed.predictedReach === 'low' || parsed.predictedReach === 'high' || parsed.predictedReach === 'medium'
        ? parsed.predictedReach
        : (score < 40 ? 'low' : score > 70 ? 'high' : 'medium');
    return { score, reasons, predictedReach };
  } catch (err) {
    console.warn('[virality] AI 실패 → heuristic fallback:', err instanceof Error ? err.message : err);
    const score = Math.max(0, Math.min(100, baseScore));
    return {
      score,
      reasons: ['AI 평가 실패 - 휴리스틱 추정.'],
      predictedReach: score < 40 ? 'low' : score > 70 ? 'high' : 'medium',
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2 — 강조 단어 자동 highlight + emoji 자동
// ─────────────────────────────────────────────────────────────────────────────

/** Claude 응답에서 첫 JSON 배열을 안전하게 추출 */
function extractJsonArray(text: string): unknown[] | null {
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

/** 너무 긴 transcript에 대비해 segment를 chunk(80개씩)로 잘라 Claude에 전달. */
const PHASE2_CHUNK_SIZE = 80;
function chunkSegments<T>(segs: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < segs.length; i += PHASE2_CHUNK_SIZE) {
    out.push(segs.slice(i, i + PHASE2_CHUNK_SIZE));
  }
  return out;
}

/**
 * 자막의 핵심 강조 단어를 Claude로 추출 — Submagic 스타일.
 * 응답 형식: [{ segmentId, keywords: [...] }]
 * 환각 방지: 결과는 실제 segment.text 안에 등장하는 단어만 남김.
 */
export async function detectEmphasisKeywords(
  transcript: Transcript,
  anthropicApiKey: string,
): Promise<Array<{ segmentId: number; keywords: string[] }>> {
  if (!anthropicApiKey || !anthropicApiKey.trim()) {
    throw new Error('Anthropic API 키가 설정되지 않았습니다.');
  }
  const client = new Anthropic({ apiKey: anthropicApiKey.trim(), maxRetries: 3, timeout: 180_000 });
  const system = `당신은 한국 유튜브 쇼츠 자막 디자이너입니다.
각 자막 segment에서 시청자의 시선을 끌어야 할 핵심 단어 1~3개를 골라 강조 후보로 표시합니다 (Submagic 스타일).

## 강조 기준 (우선순위 순)
1) **숫자/통계** — "100만", "3가지", "30초"
2) **충격/감정 형용사** — "최악", "역대급", "충격", "절대"
3) **고유명사/브랜드** — "유튜브", "삼성", "GPT"
4) **핵심 명사** — 문장의 주제어 (제일 의미가 큰 단어)
5) 조사/접속사/대명사는 **절대 강조 금지** (은/는/이/가/그래서/근데 등)

## 출력 규칙 (절대 위반 금지)
- keywords의 단어는 반드시 해당 segment.text에 **공백 포함 그대로** 등장해야 함
- 조사 붙은 형태("100만이") 그대로 OK — 하지만 단어 경계는 자연스럽게
- segment당 최대 3개. 의미 강조가 어색하면 빈 배열 [] 반환
- 짧은 segment(5자 이하)는 keyword 없이 빈 배열
- JSON 배열만 출력. 형식: [{ "segmentId": 0, "keywords": ["100만", "조회수"] }, ...]`;

  const results: Array<{ segmentId: number; keywords: string[] }> = [];
  const segChunks = chunkSegments(transcript.segments.map((s, i) => ({ id: i, text: s.text })));
  for (const chunk of segChunks) {
    const userPrompt = `다음 자막 segment들에서 강조할 핵심 단어를 골라주세요.

${chunk.map((s) => `[${s.id}] ${s.text}`).join('\n')}

⚠️ keywords는 반드시 segment.text 안에 그대로 등장하는 단어만. JSON 배열만 출력.`;
    let response;
    try {
      response = await createWithFallback(client, {
        max_tokens: 4096,
        temperature: 0.3,
        system,
        messages: [{ role: 'user', content: userPrompt }],
      });
    } catch (err) {
      const e = err as { status?: number; message?: string };
      console.error('[emphasis] Anthropic API error:', e.status, e.message);
      if (e.status === 401) throw new Error('Anthropic API 키가 잘못되었습니다.');
      continue;
    }
    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const parsed = extractJsonArray(text);
    if (!parsed) continue;
    for (const raw of parsed) {
      const item = raw as { segmentId?: number; keywords?: string[] };
      if (typeof item.segmentId !== 'number') continue;
      if (!Array.isArray(item.keywords)) continue;
      const segText = transcript.segments[item.segmentId]?.text ?? '';
      const valid = item.keywords
        .filter((k): k is string => typeof k === 'string' && k.trim().length > 0)
        .map((k) => k.trim())
        .filter((k) => segText.includes(k))
        .slice(0, 3);
      results.push({ segmentId: item.segmentId, keywords: valid });
    }
  }
  return results;
}

/** 각 segment에 어울리는 emoji 1개를 Claude로 추천. 어색하면 segmentId 제외. */
export async function suggestEmojis(
  segments: TranscriptSegment[],
  anthropicApiKey: string,
): Promise<Array<{ segmentId: number; emoji: string }>> {
  if (!anthropicApiKey || !anthropicApiKey.trim()) {
    throw new Error('Anthropic API 키가 설정되지 않았습니다.');
  }
  const client = new Anthropic({ apiKey: anthropicApiKey.trim(), maxRetries: 3, timeout: 180_000 });
  const system = `당신은 한국 유튜브 쇼츠 자막 디자이너입니다.
각 자막 segment의 감정/주제에 맞는 emoji를 정확히 1개 골라줍니다.

## 규칙
- 감정이 명확하지 않거나 어색하면 **그 segment는 결과에서 제외** (강제 매칭 금지)
- emoji는 1개만. 여러 개 조합 금지
- 추상 개념엔 무리하게 매칭하지 말 것 — 자연스러움 우선
- 좋은 예시:
  * "진짜 충격이었어요" → 😱
  * "100만원 벌었습니다" → 💰
  * "사랑합니다" → ❤️
  * "비밀입니다" → 🤫
  * "운동해야 합니다" → 💪
  * "맛있어요" → 😋
- 출력: JSON 배열만. 형식: [{ "segmentId": 0, "emoji": "😱" }, ...]`;

  const results: Array<{ segmentId: number; emoji: string }> = [];
  const segChunks = chunkSegments(segments.map((s, i) => ({ id: i, text: s.text })));
  for (const chunk of segChunks) {
    const userPrompt = `다음 자막 segment 각각에 어울리는 emoji를 골라주세요 (어색하면 생략).

${chunk.map((s) => `[${s.id}] ${s.text}`).join('\n')}

⚠️ 자연스러운 것만. 어색하면 그 segmentId는 빼고 결과 출력. JSON 배열만.`;
    let response;
    try {
      response = await createWithFallback(client, {
        max_tokens: 2048,
        temperature: 0.5,
        system,
        messages: [{ role: 'user', content: userPrompt }],
      });
    } catch (err) {
      const e = err as { status?: number; message?: string };
      console.error('[emoji] Anthropic API error:', e.status, e.message);
      if (e.status === 401) throw new Error('Anthropic API 키가 잘못되었습니다.');
      continue;
    }
    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const parsed = extractJsonArray(text);
    if (!parsed) continue;
    for (const raw of parsed) {
      const item = raw as { segmentId?: number; emoji?: string };
      if (typeof item.segmentId !== 'number') continue;
      if (typeof item.emoji !== 'string') continue;
      const e = item.emoji.trim();
      if (!e) continue;
      // 보수적 검증: emoji는 보통 2~4 UTF-16 code units
      if (e.length > 4) continue;
      results.push({ segmentId: item.segmentId, emoji: e });
    }
  }
  return results;
}
