/**
 * POST /api/ai/classify-sms — server-side proxy for the SMS-classification
 * step of the parsing pipeline (see src/tools/smsParser.ts on mobile).
 *
 * The mobile app already extracts deterministic facts from the SMS via regex
 * (amount, fee, balance, direction, ...); this endpoint only handles the fuzzy
 * part — clean merchant name, category, subcategory, channel.
 *
 * The provider is the USER'S choice (v9 migration), not a build-time constant:
 * one provider serves both this endpoint and the Finance Coach, so the two can
 * be compared on the same workload (scripts/eval-sms.mts).
 *
 * The caller may send a JSON `schema`. When present it is enforced by the
 * provider — Gemini via responseSchema, Claude via a forced tool call — so
 * category/subcategory/channel cannot come back off-list. That replaces the
 * client's greedy `extractJson` scrape and its defensive re-validation.
 *
 * Auth: a signed-in caller (mobile: Bearer token; web: session cookie).
 */
import Anthropic from '@anthropic-ai/sdk';
import {NextResponse} from 'next/server';
import {authedUser} from '@/lib/authedUser';
import {logAiUsage} from '@/lib/aiUsage';
import {MODELS, apiKeyFor, providerForUser} from '@/lib/aiProvider';

export const dynamic = 'force-dynamic';

// Small ceiling on purpose: the reply is a handful of short JSON fields, output
// is the expensive side, and a low cap bounds the damage from a runaway reply.
const MAX_OUTPUT_TOKENS = 300;

export async function POST(request: Request) {
  const {user, supabase} = await authedUser(request);
  if (!user) {
    return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  }

  const body = await request.json().catch(() => ({}));
  const system = String(body.system ?? '');
  const userPrompt = String(body.user ?? '');
  // Optional JSON Schema describing the expected reply. Built on the client,
  // which owns the category taxonomy — duplicating it here would drift.
  const schema = body.schema && typeof body.schema === 'object' ? body.schema : null;
  if (!userPrompt) {
    return NextResponse.json({error: 'Missing "user" prompt'}, {status: 400});
  }

  const provider = await providerForUser(supabase, user.id);
  const model = MODELS[provider].classify;
  const apiKey = apiKeyFor(provider);
  if (!apiKey) {
    return NextResponse.json(
      {error: `AI classification is not configured for ${provider}`},
      {status: 503},
    );
  }

  const fail = async (message: string, status: number) => {
    await logAiUsage(supabase, {
      ownerId: user.id,
      provider,
      model,
      purpose: 'sms_parse',
      inputTokens: 0,
      outputTokens: 0,
      ok: false,
      error: message.slice(0, 300),
    });
    return NextResponse.json({error: message}, {status});
  };

  try {
    let reply = '';
    let inputTokens = 0;
    let outputTokens = 0;

    if (provider === 'anthropic') {
      const client = new Anthropic({apiKey});
      // Schema enforcement via a single forced tool: the model can only reply
      // by calling it, and `strict` guarantees the arguments validate. This is
      // why the client no longer needs to scrape JSON out of prose.
      const tools = schema
        ? [
            {
              name: 'record_classification',
              description: 'Record the classification of this SMS.',
              input_schema: schema as Anthropic.Tool.InputSchema,
              strict: true,
            },
          ]
        : undefined;

      const msg = await client.messages.create({
        model,
        max_tokens: MAX_OUTPUT_TOKENS,
        // Deterministic: the same SMS should classify the same way every time,
        // otherwise the learned-rule keys shift under us between runs.
        temperature: 0,
        system,
        messages: [{role: 'user', content: userPrompt}],
        ...(tools ? {tools, tool_choice: {type: 'tool' as const, name: 'record_classification'}} : {}),
      });

      inputTokens = msg.usage.input_tokens;
      outputTokens = msg.usage.output_tokens;

      const toolUse = msg.content.find(b => b.type === 'tool_use');
      if (toolUse && toolUse.type === 'tool_use') {
        // Already-validated object — hand it back as JSON so the client path is
        // identical for both providers.
        reply = JSON.stringify(toolUse.input);
      } else {
        reply = msg.content.find(b => b.type === 'text')?.text ?? '';
      }
    } else {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            // Gemini has no separate system slot — fold it in as a leading block.
            contents: [{parts: [{text: system ? `${system}\n\n${userPrompt}` : userPrompt}]}],
            generationConfig: {
              responseMimeType: 'application/json',
              ...(schema ? {responseSchema: toGeminiSchema(schema)} : {}),
              temperature: 0,
              maxOutputTokens: MAX_OUTPUT_TOKENS,
            },
          }),
        },
      );
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        return fail(`Gemini error ${res.status}: ${errText.slice(0, 200)}`, 502);
      }
      const data = await res.json();
      reply = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      inputTokens = data?.usageMetadata?.promptTokenCount ?? 0;
      outputTokens = data?.usageMetadata?.candidatesTokenCount ?? 0;
    }

    await logAiUsage(supabase, {
      ownerId: user.id,
      provider,
      model,
      purpose: 'sms_parse',
      inputTokens,
      outputTokens,
      ok: true,
    });

    if (!reply) {
      return fail(`Empty response from ${provider}`, 502);
    }
    // `provider`/`model` are echoed so the client can attribute a record and so
    // the eval harness can confirm which model actually served the request.
    return NextResponse.json({reply, provider, model});
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Unknown error', 502);
  }
}

/**
 * Gemini's responseSchema is OpenAPI-flavoured: uppercase `type`, and it
 * rejects JSON-Schema keywords it doesn't know (`additionalProperties`,
 * `$schema`). Translate rather than sending JSON Schema straight through.
 */
function toGeminiSchema(node: any): any {
  if (!node || typeof node !== 'object') {
    return node;
  }
  if (Array.isArray(node)) {
    return node.map(toGeminiSchema);
  }
  const out: any = {};
  if (node.type) {
    out.type = String(node.type).toUpperCase();
  }
  if (node.description) {
    out.description = node.description;
  }
  if (node.enum) {
    out.enum = node.enum;
  }
  if (node.properties) {
    out.properties = Object.fromEntries(
      Object.entries(node.properties).map(([k, v]) => [k, toGeminiSchema(v)]),
    );
  }
  if (node.required) {
    out.required = node.required;
  }
  if (node.items) {
    out.items = toGeminiSchema(node.items);
  }
  return out;
}
