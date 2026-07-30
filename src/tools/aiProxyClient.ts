// Client for FinXAI's own server-side AI proxy (apps/web's /api/ai/* routes),
// which hold the Gemini/Anthropic API keys server-side. Replaces the old
// "bring your own API key, stored on-device" flow — new users get working
// AI SMS parsing and Finance Coach chat with zero setup.
//
// Deliberately takes the auth token as a plain parameter instead of calling
// supabase.auth.getSession() itself — this file is imported by
// smsParser.ts, which is unit-tested in plain Jest with no RN/AsyncStorage
// mocking. Importing ./supabase here would pull that whole chain into every
// smsParser.ts test. Callers (SMSRetriever.tsx, AIChatScreen.tsx,
// AISettingsScreen.tsx) already deal with Supabase directly and fetch the
// token themselves, same as sendInviteEmail in ./invites.ts.

const API_BASE = 'https://app.feyton.co.rw';

export interface ToolMessage {
  role: 'user' | 'assistant';
  content: any;
}

export interface ClaudeToolTurn {
  stopReason: string;
  content: any[];
}

function authHeaders(authToken: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${authToken}`,
  };
}

// SMS classification (merchant/category/subcategory/channel) — the fuzzy
// part of the parsing pipeline in src/tools/smsParser.ts. Deterministic
// facts (amount, fee, balance, direction, ...) are still extracted on-device
// via regex; only this classification step needs the model.
// A hung request used to block SMS processing indefinitely — `fetch` has no
// default timeout, so a cold-starting or wedged server stalled the whole
// inbox loop rather than failing fast.
const CLASSIFY_TIMEOUT_MS = 12_000;

export class MissingAuthError extends Error {
  constructor() {
    super('Not signed in — cannot reach the AI classifier');
    this.name = 'MissingAuthError';
  }
}

async function postClassify(
  system: string,
  user: string,
  authToken: string,
  schema?: Record<string, unknown>,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLASSIFY_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}/api/ai/classify-sms`, {
      method: 'POST',
      headers: authHeaders(authToken),
      // `schema` lets the server enforce the reply shape at the provider, so
      // the category/subcategory/channel enums are guaranteed on-list.
      body: JSON.stringify({system, user, schema}),
      signal: controller.signal,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err: any = new Error(
        body?.error ?? `classify-sms failed (${res.status})`,
      );
      err.status = res.status;
      throw err;
    }
    if (!body.reply) {
      throw new Error('Empty response from AI classifier');
    }
    return body.reply;
  } finally {
    clearTimeout(timer);
  }
}

export async function classifySms(
  system: string,
  user: string,
  authToken: string,
  schema?: Record<string, unknown>,
): Promise<string> {
  // Don't burn a request (and a silent regex fallback) on a missing session —
  // `session?.access_token ?? ''` upstream would send a bare `Bearer `, the
  // server would 401, and the failure would look like a parser bug.
  if (!authToken) {
    throw new MissingAuthError();
  }
  try {
    return await postClassify(system, user, authToken, schema);
  } catch (e: any) {
    // Retry once on transient failures only: timeout/abort, network error, or
    // 5xx. A 4xx is a real rejection (bad token, bad request) and retrying it
    // just doubles the latency before the same fallback.
    const status = e?.status;
    const transient =
      e?.name === 'AbortError' ||
      status == null ||
      (typeof status === 'number' && status >= 500);
    if (!transient) {
      throw e;
    }
    return await postClassify(system, user, authToken);
  }
}

// AI Coach chat — one agentic tool-use turn. Tool EXECUTION stays on-device
// against the local PowerSync database; this just relays the turn to Claude.
// Model choice lives server-side now — nothing left for the client to pick.
export async function chatTools(
  messages: ToolMessage[],
  systemPrompt: string,
  tools: any[],
  authToken: string,
): Promise<ClaudeToolTurn> {
  const res = await fetch(`${API_BASE}/api/ai/chat`, {
    method: 'POST',
    headers: authHeaders(authToken),
    body: JSON.stringify({messages, systemPrompt, tools}),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.error ?? `chat failed (${res.status})`);
  }
  return {stopReason: body.stopReason, content: body.content ?? []};
}

export interface AiTestResult {
  gemini: {ok: boolean; error?: string};
  anthropic: {ok: boolean; error?: string};
}

// "Test connection" — there's no per-user key left to validate, only
// whether FinXAI's own server-side setup is healthy right now.
export async function testAiConnection(authToken: string): Promise<AiTestResult> {
  const res = await fetch(`${API_BASE}/api/ai/test`, {
    headers: {Authorization: `Bearer ${authToken}`},
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.error ?? `test failed (${res.status})`);
  }
  return body;
}
