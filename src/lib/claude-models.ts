/**
 * Claude 모델 fallback chain.
 * 사용자 Anthropic API 키 plan에 따라 access 가능한 모델이 달라서,
 * 신선한 모델부터 시도하다가 404면 다음 모델로 fallback.
 *
 * 발생 사례 (외부 사용자 보고):
 * "404 not_found_error: model: claude-sonnet-4-20250514"
 *   → 일부 사용자 키는 특정 모델 ID access X.
 */
import type Anthropic from '@anthropic-ai/sdk';

const MODEL_CHAIN = [
  'claude-sonnet-4-5',         // 최신 4.5 (Pro/Team plan)
  'claude-3-5-sonnet-latest',  // 3.5 latest alias (모든 plan)
  'claude-3-5-sonnet-20241022',// 명시적 3.5 (가장 안정적)
];

/**
 * messages.create을 model chain으로 시도. 404가 나면 다음 모델로 자동 fallback.
 * 다른 에러(401/429/5xx 등)는 첫 시도에서 그대로 throw.
 */
export async function createWithFallback(
  client: Anthropic,
  params: Omit<Parameters<Anthropic['messages']['create']>[0], 'model'>,
): Promise<Anthropic.Messages.Message> {
  let lastError: unknown;
  for (const model of MODEL_CHAIN) {
    try {
      const response = await client.messages.create({
        ...params,
        model,
        stream: false,
      } as Parameters<Anthropic['messages']['create']>[0]);
      console.log(`[claude] used model: ${model}`);
      return response as Anthropic.Messages.Message;
    } catch (err) {
      const e = err as { status?: number; message?: string };
      lastError = err;
      if (e.status === 404) {
        console.warn(`[claude] model ${model} 404, trying next in chain`);
        continue;
      }
      // 404가 아닌 에러는 즉시 throw (auth/rate limit 등)
      throw err;
    }
  }
  // 모든 모델이 404 → 사용자에게 명확한 안내
  throw new Error(
    'Anthropic 계정에서 사용 가능한 Claude 모델을 찾지 못했어요. ' +
      'console.anthropic.com에서 모델 접근 권한 또는 결제 상태를 확인해주세요.',
  );
  void lastError; // keep reference for debugging
}
