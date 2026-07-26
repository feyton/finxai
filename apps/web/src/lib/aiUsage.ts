import type {SupabaseClient} from '@supabase/supabase-js';

// $ per 1M tokens — update alongside AI_MODELS in the route files.
const PRICING: Record<string, {input: number; output: number}> = {
  'gemini-3.5-flash': {input: 1.5, output: 9.0},
  'claude-sonnet-4-6': {input: 3.0, output: 15.0},
};

export async function logAiUsage(
  supabase: SupabaseClient,
  args: {
    ownerId: string;
    provider: 'anthropic' | 'gemini';
    model: string;
    purpose: 'sms_parse' | 'chat';
    inputTokens: number;
    outputTokens: number;
    ok: boolean;
    error?: string;
  },
): Promise<void> {
  const price = PRICING[args.model];
  const cost = price
    ? (args.inputTokens / 1_000_000) * price.input +
      (args.outputTokens / 1_000_000) * price.output
    : 0;
  try {
    await supabase.from('ai_usage_logs').insert({
      owner_id: args.ownerId,
      provider: args.provider,
      model: args.model,
      purpose: args.purpose,
      input_tokens: args.inputTokens,
      output_tokens: args.outputTokens,
      estimated_cost_usd: cost,
      ok: args.ok,
      error: args.error ?? null,
    });
  } catch (e) {
    // Never let a logging failure break the actual AI response.
    console.error('[aiUsage] failed to log usage:', e);
  }
}
