import type {SupabaseClient} from '@supabase/supabase-js';

/**
 * Which AI provider serves a given user, for BOTH SMS classification and the
 * Finance Coach.
 *
 * FinXAI used to call two providers at once — Gemini for SMS, Claude for the
 * coach — which meant two sets of failure modes and no way to compare them on
 * the same workload. The provider is now one per-user choice (v9 migration),
 * with the server env as the fallback for users who haven't picked.
 */
export type AiProvider = 'anthropic' | 'gemini';

const VALID: AiProvider[] = ['anthropic', 'gemini'];

/**
 * Claude is the default, measured rather than assumed.
 *
 * Gemini's free tier caps at 20 requests per model per day
 * (generate_content_free_tier_requests). Evaluating 263 real messages, 237
 * returned HTTP 429 — which is what had been silently pushing every SMS onto
 * the regex fallback. Gemini stays fully supported for anyone with a paid
 * Google key, but it cannot be the default at this app's message volume.
 */
export function defaultProvider(): AiProvider {
  const env = (process.env.AI_PROVIDER_DEFAULT ?? '').toLowerCase();
  return (VALID as string[]).includes(env) ? (env as AiProvider) : 'anthropic';
}

/**
 * Reads the user's stored choice, falling back to the server default.
 *
 * Never throws: a settings-table hiccup must not take down classification, so
 * anything unexpected degrades to the default provider.
 */
export async function providerForUser(
  supabase: SupabaseClient,
  ownerId: string,
): Promise<AiProvider> {
  try {
    const {data} = await supabase
      .from('user_settings')
      .select('ai_provider')
      .eq('owner_id', ownerId)
      .maybeSingle();
    const chosen = (data?.ai_provider ?? '').toLowerCase();
    if ((VALID as string[]).includes(chosen)) {
      return chosen as AiProvider;
    }
  } catch {
    // fall through to the default
  }
  return defaultProvider();
}

/**
 * Models per provider. Classification and chat are deliberately different
 * tiers: classification is a bounded label-picking task over facts a regex
 * already extracted, chat is open-ended reasoning over the user's finances.
 */
export const MODELS = {
  anthropic: {
    // Haiku 4.5: $1/$5 per MTok, 200K context, supports structured outputs.
    // NOTE: prompt caching is NOT worth attempting here — Haiku 4.5's minimum
    // cacheable prefix is 4096 tokens and the classification prompt is well
    // under that, so a cache_control breakpoint would silently never hit.
    // NOTE: no extended thinking and no `effort` — this is a bounded
    // classification, thinking buys nothing, and `effort` is rejected outright
    // on Haiku 4.5.
    classify: process.env.ANTHROPIC_CLASSIFY_MODEL ?? 'claude-haiku-4-5',
    chat: process.env.ANTHROPIC_CHAT_MODEL ?? 'claude-sonnet-4-6',
  },
  gemini: {
    classify: process.env.GEMINI_MODEL ?? 'gemini-3.5-flash',
    chat: process.env.GEMINI_CHAT_MODEL ?? 'gemini-3.5-flash',
  },
} as const;

export function apiKeyFor(provider: AiProvider): string | undefined {
  return provider === 'anthropic'
    ? process.env.ANTHROPIC_API_KEY
    : process.env.GEMINI_API_KEY;
}
