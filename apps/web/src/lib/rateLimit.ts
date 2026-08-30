import type {SupabaseClient} from '@supabase/supabase-js';

/**
 * Per-user request throttling for the paid API routes (/api/ai/*, /api/invite).
 *
 * In-memory on purpose: the app runs as a single PM2 process (finxai-web), so
 * one Map covers every request. If this ever moves to multiple instances the
 * limiter degrades gracefully — each instance enforces the limit independently,
 * so the effective ceiling is (limit x instances), still bounded.
 *
 * Windows are sliding, not fixed: a fixed window lets a caller spend a full
 * quota at 11:59 and again at 12:00.
 */
const buckets = new Map<string, number[]>();

// A forgotten key costs a few bytes forever; with per-user keys and a small
// user base that's fine, but sweep on writes anyway so an abusive scan of
// random tokens can't grow the Map without bound.
let lastSweep = 0;
function sweep(now: number, maxWindowMs: number) {
  if (now - lastSweep < 60_000) {
    return;
  }
  lastSweep = now;
  for (const [key, hits] of buckets) {
    if (hits.length === 0 || now - hits[hits.length - 1] > maxWindowMs) {
      buckets.delete(key);
    }
  }
}

export function rateLimit(
  key: string,
  opts: {limit: number; windowMs: number},
): {ok: true} | {ok: false; retryAfterSec: number} {
  const now = Date.now();
  sweep(now, opts.windowMs);
  const hits = (buckets.get(key) ?? []).filter(t => now - t < opts.windowMs);
  if (hits.length >= opts.limit) {
    const retryAfterSec = Math.max(1, Math.ceil((hits[0] + opts.windowMs - now) / 1000));
    buckets.set(key, hits);
    return {ok: false, retryAfterSec};
  }
  hits.push(now);
  buckets.set(key, hits);
  return {ok: true};
}

/**
 * Hard daily cost ceiling per user, on top of the per-minute throttle. The
 * throttle bounds the request *rate*; this bounds the *money*, which is the
 * thing that actually matters — ai_usage_logs already records the estimated
 * cost of every call (lib/aiUsage.ts), it just never said "enough".
 *
 * Reads as the calling user (the logs table is owner-scoped under RLS), served
 * by the (owner_id, created_at DESC) index from migration v7. Fails OPEN: if
 * the check itself errors, the request proceeds — a Supabase blip must not
 * take SMS classification down with it (availability was the lesson of the
 * Gemini 429 incident: silent degradation of the parse pipeline is worse than
 * a day of unmetered spend for one user).
 *
 * At the default $1.50/day one user covers ~1,300 SMS classifications or
 * ~75 coach turns — far beyond real use, small enough to cap abuse.
 */
const DAILY_CAP_USD = Number(process.env.AI_DAILY_COST_CAP_USD || '1.5');

export async function underDailyCostCap(
  supabase: SupabaseClient,
  ownerId: string,
): Promise<{ok: boolean; spentUsd: number; capUsd: number}> {
  try {
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const {data, error} = await supabase
      .from('ai_usage_logs')
      .select('estimated_cost_usd')
      .eq('owner_id', ownerId)
      .gte('created_at', dayStart.toISOString());
    if (error) {
      throw error;
    }
    const spentUsd = (data ?? []).reduce(
      (sum, r) => sum + Number(r.estimated_cost_usd ?? 0),
      0,
    );
    return {ok: spentUsd < DAILY_CAP_USD, spentUsd, capUsd: DAILY_CAP_USD};
  } catch (e) {
    console.error('[rateLimit] daily cap check failed, allowing request:', e);
    return {ok: true, spentUsd: 0, capUsd: DAILY_CAP_USD};
  }
}
