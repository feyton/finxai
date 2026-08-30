/**
 * POST /api/ai/chat — one agentic tool-use turn for the Finance Coach.
 *
 * Tool EXECUTION stays on-device against the local PowerSync database; this
 * only relays the turn to the model. The provider is the USER'S choice (v9
 * migration) and serves both this endpoint and SMS classification.
 *
 * The response shape is always Claude-flavoured (`{stopReason, content}` with
 * tool_use blocks) regardless of provider, so the mobile agentic loop needs no
 * per-provider branch — see lib/geminiChat.ts for the translation.
 *
 * Auth: a signed-in caller (mobile: Bearer token; web: session cookie).
 */
import {NextResponse} from 'next/server';
import {authedUser} from '@/lib/authedUser';
import {logAiUsage} from '@/lib/aiUsage';
import {MODELS, apiKeyFor, providerForUser} from '@/lib/aiProvider';
import {fromGeminiResponse, toGeminiContents, toGeminiTools} from '@/lib/geminiChat';
import {rateLimit, underDailyCostCap} from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MAX_OUTPUT_TOKENS = 1024;

export async function POST(request: Request) {
  const {user, supabase} = await authedUser(request);
  if (!user) {
    return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  }

  // Chat runs the pricier model, so its throttle is tighter than classify's.
  // An agentic turn is 1-3 calls (tool round trips), so 30/5min is ~10 real
  // coach exchanges — beyond any legitimate conversation pace.
  const rl = rateLimit(`chat:${user.id}`, {limit: 30, windowMs: 5 * 60_000});
  if (!rl.ok) {
    return NextResponse.json(
      {error: 'Too many coach requests — give it a minute.'},
      {status: 429, headers: {'Retry-After': String(rl.retryAfterSec)}},
    );
  }
  const cap = await underDailyCostCap(supabase, user.id);
  if (!cap.ok) {
    return NextResponse.json(
      {error: `Daily AI budget reached ($${cap.capUsd.toFixed(2)}). Resets at midnight UTC.`},
      {status: 429, headers: {'Retry-After': '3600'}},
    );
  }

  const body = await request.json().catch(() => ({}));
  const messages = body.messages;
  const systemPrompt = String(body.systemPrompt ?? '');
  const tools = Array.isArray(body.tools) ? body.tools : [];
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({error: 'Missing "messages"'}, {status: 400});
  }
  // Generous for the coach's real shape (system prompt + tool catalog + a
  // conversation), a wall for anyone using the endpoint as a general proxy.
  if (
    messages.length > 60 ||
    systemPrompt.length > 60_000 ||
    tools.length > 24 ||
    JSON.stringify(messages).length > 200_000
  ) {
    return NextResponse.json({error: 'Request too large'}, {status: 413});
  }

  const provider = await providerForUser(supabase, user.id);
  // An explicit body.model still wins, so the eval harness and any debugging
  // can pin a model without touching the user's stored setting.
  const model = String(body.model || MODELS[provider].chat);
  const apiKey = apiKeyFor(provider);
  if (!apiKey) {
    return NextResponse.json(
      {error: `Finance Coach is not configured for ${provider}`},
      {status: 503},
    );
  }

  const log = (ok: boolean, inputTokens = 0, outputTokens = 0, error?: string) =>
    logAiUsage(supabase, {
      ownerId: user.id,
      provider,
      model,
      purpose: 'chat',
      inputTokens,
      outputTokens,
      ok,
      error: error?.slice(0, 300),
    });

  try {
    if (provider === 'anthropic') {
      const res = await fetch(ANTHROPIC_ENDPOINT, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: MAX_OUTPUT_TOKENS,
          // The coach's system prompt is large and stable across a
          // conversation, and Sonnet's cacheable minimum is 1024 tokens, so
          // caching genuinely pays here (unlike the short classification
          // prompt on Haiku 4.5 — see lib/aiProvider.ts).
          system: [{type: 'text', text: systemPrompt, cache_control: {type: 'ephemeral'}}],
          messages,
          tools,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data?.error?.message ?? `HTTP ${res.status}`;
        await log(false, 0, 0, msg);
        return NextResponse.json({error: msg}, {status: 502});
      }
      await log(true, data.usage?.input_tokens ?? 0, data.usage?.output_tokens ?? 0);
      return NextResponse.json({
        stopReason: data.stop_reason,
        content: data.content ?? [],
        provider,
        model,
      });
    }

    // Gemini path — translated in and out so the client sees Claude's shape.
    const geminiTools = toGeminiTools(tools);
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          ...(systemPrompt ? {systemInstruction: {parts: [{text: systemPrompt}]}} : {}),
          contents: toGeminiContents(messages),
          ...(geminiTools.length ? {tools: geminiTools} : {}),
          generationConfig: {maxOutputTokens: MAX_OUTPUT_TOKENS, temperature: 0.3},
        }),
      },
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error?.message ?? `HTTP ${res.status}`;
      await log(false, 0, 0, msg);
      return NextResponse.json({error: msg}, {status: 502});
    }
    await log(
      true,
      data?.usageMetadata?.promptTokenCount ?? 0,
      data?.usageMetadata?.candidatesTokenCount ?? 0,
    );
    return NextResponse.json({...fromGeminiResponse(data), provider, model});
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    await log(false, 0, 0, msg);
    return NextResponse.json({error: `Failed to reach ${provider}`}, {status: 502});
  }
}
