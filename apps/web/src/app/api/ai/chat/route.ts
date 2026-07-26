/**
 * POST /api/ai/chat — server-side proxy for the AI Coach chat's agentic
 * tool-use turns (see src/tools/anthropicClient.ts's old askClaudeTools,
 * now called via src/tools/aiProxyClient.ts on mobile).
 *
 * Tool EXECUTION still happens on the phone against the local PowerSync
 * database (reading/writing the user's own data) — this endpoint only
 * relays one Messages API turn to Claude with the key held server-side,
 * and returns Claude's reply (text + any tool_use blocks) unchanged for
 * the phone to continue its loop exactly as before.
 *
 * Auth: same as /api/invite — a signed-in caller (mobile: Bearer token).
 */
import {NextResponse} from 'next/server';
import {authedUser} from '@/lib/authedUser';
import {logAiUsage} from '@/lib/aiUsage';

export const dynamic = 'force-dynamic';

const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MODEL = process.env.ANTHROPIC_CHAT_MODEL ?? 'claude-sonnet-4-6';

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {error: 'Finance Coach is not configured on the server'},
      {status: 503},
    );
  }

  const {user, supabase} = await authedUser(request);
  if (!user) {
    return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  }

  const body = await request.json().catch(() => ({}));
  const messages = body.messages;
  const systemPrompt = String(body.systemPrompt ?? '');
  const model = String(body.model || DEFAULT_MODEL);
  const tools = Array.isArray(body.tools) ? body.tools : [];
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({error: 'Missing "messages"'}, {status: 400});
  }

  try {
    const res = await fetch(ANTHROPIC_ENDPOINT, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        system: [{type: 'text', text: systemPrompt, cache_control: {type: 'ephemeral'}}],
        messages,
        tools,
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      await logAiUsage(supabase, {
        ownerId: user.id,
        provider: 'anthropic',
        model,
        purpose: 'chat',
        inputTokens: 0,
        outputTokens: 0,
        ok: false,
        error: data?.error?.message ?? `HTTP ${res.status}`,
      });
      return NextResponse.json(
        {error: data?.error?.message ?? `Claude error ${res.status}`},
        {status: 502},
      );
    }

    await logAiUsage(supabase, {
      ownerId: user.id,
      provider: 'anthropic',
      model,
      purpose: 'chat',
      inputTokens: data.usage?.input_tokens ?? 0,
      outputTokens: data.usage?.output_tokens ?? 0,
      ok: true,
    });

    return NextResponse.json({
      stopReason: data.stop_reason,
      content: data.content ?? [],
    });
  } catch (e) {
    await logAiUsage(supabase, {
      ownerId: user.id,
      provider: 'anthropic',
      model,
      purpose: 'chat',
      inputTokens: 0,
      outputTokens: 0,
      ok: false,
      error: e instanceof Error ? e.message : 'Unknown error',
    });
    return NextResponse.json({error: 'Failed to reach Claude'}, {status: 502});
  }
}
