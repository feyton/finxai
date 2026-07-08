const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const VERSION = '2023-06-01';
const VALIDATE_MODEL = 'claude-haiku-4-5-20251001';

export interface AnthropicApiMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function askClaude(
  messages: AnthropicApiMessage[],
  systemPrompt: string,
  apiKey: string,
  model: string,
): Promise<string> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': VERSION,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system: [{type: 'text', text: systemPrompt, cache_control: {type: 'ephemeral'}}],
      messages,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `API error ${res.status}`);
  }

  const data = await res.json();
  const text: string | undefined = data.content?.[0]?.text;
  if (!text) {throw new Error('Empty response from Claude');}
  return text;
}

export async function validateAnthropicKey(key: string): Promise<{ok: boolean; error?: string}> {
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'x-api-key': key.trim(),
        'anthropic-version': VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: VALIDATE_MODEL,
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
  } catch (e: any) {
    return {ok: false, error: e?.message ?? 'Network error'};
  }
}
