import { NextResponse } from 'next/server';

/**
 * API 키 유효성 검증.
 * 각 provider의 가벼운(과금 없는) models 엔드포인트를 호출해 실제 작동하는 키인지 확인.
 * 서버(Node)에서 호출하므로 CORS/브라우저 제약 없음. 키는 저장하지 않음.
 */
export async function POST(req: Request) {
  const { provider, key } = (await req.json()) as {
    provider?: string;
    key?: string;
  };
  const trimmed = (key || '').trim();

  if (!trimmed) {
    return NextResponse.json({ ok: false, error: '키가 비어 있습니다.' });
  }

  try {
    if (provider === 'anthropic') {
      const res = await fetch('https://api.anthropic.com/v1/models', {
        headers: {
          'x-api-key': trimmed,
          'anthropic-version': '2023-06-01',
        },
      });
      if (res.ok) return NextResponse.json({ ok: true });
      return NextResponse.json({
        ok: false,
        error:
          res.status === 401
            ? '인증 실패 — 키가 유효하지 않습니다 (401).'
            : `Anthropic 응답 오류 (${res.status})`,
      });
    }

    if (provider === 'openai') {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${trimmed}` },
      });
      if (res.ok) return NextResponse.json({ ok: true });
      return NextResponse.json({
        ok: false,
        error:
          res.status === 401
            ? '인증 실패 — 키가 유효하지 않습니다 (401).'
            : `OpenAI 응답 오류 (${res.status})`,
      });
    }

    return NextResponse.json({ ok: false, error: '알 수 없는 provider' });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? `네트워크 오류: ${e.message}` : '네트워크 오류',
    });
  }
}
