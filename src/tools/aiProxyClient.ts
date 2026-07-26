// Client for FinXAI's own server-side AI proxy (apps/web's /api/ai/* routes),
// which hold the Gemini/Anthropic API keys server-side. Replaces the old
// "bring your own API key, stored on-device" flow — new users get working
// AI SMS parsing and Finance Coach chat with zero setup.
//
// Deliberately takes the auth token as a plain parameter instead of calling
// supabase.auth.getSession() itself — this file is imported by
// claudeParser.ts, which is unit-tested in plain Jest with no RN/AsyncStorage
// mocking. Importing ./supabase here would pull that whole chain into every
// claudeParser.ts test. Callers (SMSRetriever.tsx, AIChatScreen.tsx,
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

// SMS classification (merchant/category/channel/is_transfer) — the fuzzy
// part of the parsing pipeline in src/tools/claudeParser.ts. Deterministic
// facts (amount, fee, balance, direction, ...) are still extracted on-device
// via regex; only this classification step needs the model.
export async function classifySms(
  system: string,
  user: string,
  authToken: string,
): Promise<string> {
  const res = await fetch(`${API_BASE}/api/ai/classify-sms`, {
    method: 'POST',
    headers: authHeaders(authToken),
    body: JSON.stringify({system, user}),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.error ?? `classify-sms failed (${res.status})`);
  }
  if (!body.reply) {
    throw new Error('Empty response from AI classifier');
  }
  return body.reply;
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
