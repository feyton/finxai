/**
 * GET /api/ai/test — checks that the server's AI keys are actually working,
 * for the "Test connection" button in the app's AI status screen. Keys are
 * server-managed now (see /api/ai/classify-sms, /api/ai/chat), so there's
 * nothing left for a user to "test" except whether FinXAI's own setup is
 * healthy — this pings both providers with the cheapest possible call.
 *
 * Auth: same as /api/invite — a signed-in caller (mobile: Bearer token).
 */
import {NextResponse} from 'next/server';
import {authedUser} from '@/lib/authedUser';

export const dynamic = 'force-dynamic';

async function testGemini(): Promise<{ok: boolean; error?: string}> {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL ?? 'gemini-3.5-flash';
  if (!apiKey) {
    return {ok: false, error: 'Not configured on the server'};
  }
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          contents: [{parts: [{text: 'Reply with the single word: OK'}]}],
          generationConfig: {maxOutputTokens: 4},
        }),
      },
    );
    if (res.status === 400) {return {ok: false, error: 'Invalid API key'};}
    if (res.status === 404) {return {ok: false, error: `Model "${model}" not found`};}
    if (!res.ok) {return {ok: false, error: `API error ${res.status}`};}
    return {ok: true};
  } catch (e) {
    return {ok: false, error: e instanceof Error ? e.message : 'Network error'};
  }
}

async function testAnthropic(): Promise<{ok: boolean; error?: string}> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {ok: false, error: 'Not configured on the server'};
  }
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 4,
        messages: [{role: 'user', content: 'Hi'}],
      }),
    });
    if (res.status === 401) {return {ok: false, error: 'Invalid API key'};}
    if (res.status === 403) {return {ok: false, error: 'API key lacks permission'};}
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return {ok: false, error: body?.error?.message ?? `API error ${res.status}`};
    }
    return {ok: true};
  } catch (e) {
    return {ok: false, error: e instanceof Error ? e.message : 'Network error'};
  }
}

export async function GET(request: Request) {
  const {user} = await authedUser(request);
  if (!user) {
    return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  }

  const [gemini, anthropic] = await Promise.all([testGemini(), testAnthropic()]);
  return NextResponse.json({gemini, anthropic});
}
