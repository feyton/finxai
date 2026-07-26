/**
 * POST /api/ai/classify-sms — server-side proxy for the SMS-classification
 * step of the parsing pipeline (see src/tools/claudeParser.ts on mobile).
 *
 * The mobile app already extracts deterministic facts from the SMS via
 * regex (amount, fee, balance, direction, ...) — this endpoint only handles
 * the fuzzy part (clean merchant name, category, channel, is_transfer),
 * exactly like the old on-device call did, just now via Gemini 3.5 Flash
 * with the API key held server-side instead of a per-user key on the phone.
 *
 * Auth: same as /api/invite — a signed-in caller (mobile: Bearer token).
 */
import {NextResponse} from 'next/server';
import {authedUser} from '@/lib/authedUser';
import {logAiUsage} from '@/lib/aiUsage';

export const dynamic = 'force-dynamic';

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-3.5-flash';

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {error: 'AI classification is not configured on the server'},
      {status: 503},
    );
  }

  const {user, supabase} = await authedUser(request);
  if (!user) {
    return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  }

  const body = await request.json().catch(() => ({}));
  const system = String(body.system ?? '');
  const userPrompt = String(body.user ?? '');
  if (!userPrompt) {
    return NextResponse.json({error: 'Missing "user" prompt'}, {status: 400});
  }

  // Gemini has no separate system-message slot the way Claude does — fold
  // it into the same prompt as a leading instruction block, same content
  // the model already receives today, just concatenated differently.
  const prompt = system ? `${system}\n\n${userPrompt}` : userPrompt;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          contents: [{parts: [{text: prompt}]}],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.1,
            maxOutputTokens: 512,
          },
        }),
      },
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      await logAiUsage(supabase, {
        ownerId: user.id,
        provider: 'gemini',
        model: GEMINI_MODEL,
        purpose: 'sms_parse',
        inputTokens: 0,
        outputTokens: 0,
        ok: false,
        error: `HTTP ${res.status}: ${errText.slice(0, 300)}`,
      });
      return NextResponse.json(
        {error: `Gemini error ${res.status}`},
        {status: 502},
      );
    }

    const data = await res.json();
    const reply: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const usage = data?.usageMetadata ?? {};

    await logAiUsage(supabase, {
      ownerId: user.id,
      provider: 'gemini',
      model: GEMINI_MODEL,
      purpose: 'sms_parse',
      inputTokens: usage.promptTokenCount ?? 0,
      outputTokens: usage.candidatesTokenCount ?? 0,
      ok: true,
    });

    if (!reply) {
      return NextResponse.json({error: 'Empty response from Gemini'}, {status: 502});
    }
    return NextResponse.json({reply});
  } catch (e) {
    await logAiUsage(supabase, {
      ownerId: user.id,
      provider: 'gemini',
      model: GEMINI_MODEL,
      purpose: 'sms_parse',
      inputTokens: 0,
      outputTokens: 0,
      ok: false,
      error: e instanceof Error ? e.message : 'Unknown error',
    });
    return NextResponse.json({error: 'Failed to reach Gemini'}, {status: 502});
  }
}
