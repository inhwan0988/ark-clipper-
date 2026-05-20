import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createWithFallback } from '@/lib/claude-models';

export async function POST(req: Request) {
  const apiKey = req.headers.get('x-api-key') || process.env.ANTHROPIC_API_KEY || '';
  const body = (await req.json()) as { scriptText?: string };
  const scriptText = (body.scriptText || '').trim();

  if (!apiKey.trim()) {
    return NextResponse.json(
      { error: 'Anthropic API 키가 설정되지 않았습니다. 홈 화면에서 API 키를 입력해주세요.' },
      { status: 400 },
    );
  }
  if (!scriptText) {
    return NextResponse.json({ error: '스크립트가 비어있습니다.' }, { status: 400 });
  }

  const client = new Anthropic({ apiKey: apiKey.trim(), maxRetries: 5, timeout: 120_000 });
  const prompt = `너는 한국어 쇼츠 영상의 후킹 제목을 작성하는 전문가다.

아래는 한 쇼츠 클립(약 30~60초)의 실제 음성 스크립트다:

"""
${scriptText}
"""

이 스크립트의 핵심 메시지와 어그로 포인트를 살려, 사람들이 클릭하지 않으면 손해 보는 느낌이 강하게 들도록 쇼츠 제목 5개를 만들어라.

규칙:
- 각 제목은 정확히 두 줄로 줄바꿈(\\n)을 포함해야 한다 (1줄 = 5~12자, 2줄 = 5~12자).
- 1줄째는 호기심/의문/충격 유발, 2줄째는 결과/이유/핵심.
- 숫자, 부정/위험 워닝, 단언, 질문형, 비교 등 후킹 패턴을 적절히 섞어라.
- 너무 자극적이거나 가짜 정보 같은 어휘는 피해라 (어그로하되 진실에 기반).
- 따옴표/이모지/해시태그 금지.

JSON 형식으로만 응답해라. 다른 텍스트는 절대 포함하지 마라:
{
  "titles": ["1줄째\\n2줄째", "1줄째\\n2줄째", ...]
}`;

  try {
    const response = await createWithFallback(client, {
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });
    const text =
      response.content[0]?.type === 'text' ? response.content[0].text : '';
    // JSON만 추출
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json(
        { error: 'AI 응답을 파싱할 수 없습니다.', raw: text },
        { status: 500 },
      );
    }
    const parsed = JSON.parse(jsonMatch[0]) as { titles?: string[] };
    const titles = (parsed.titles || [])
      .filter((t): t is string => typeof t === 'string' && t.length > 0)
      .slice(0, 5);
    if (titles.length === 0) {
      return NextResponse.json(
        { error: '추천 제목을 생성하지 못했습니다.' },
        { status: 500 },
      );
    }
    return NextResponse.json({ titles });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Title suggestion failed' },
      { status: 500 },
    );
  }
}
