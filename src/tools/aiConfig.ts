import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_GEMINI_API  = 'finxai:gemini_api_key';
const KEY_GEMINI_MODEL = 'finxai:gemini_model';
const KEY_ANTHROPIC_API = 'finxai:anthropic_api_key';
const KEY_ANTHROPIC_MODEL = 'finxai:anthropic_model';

// Default: gemini-2.5-flash (user called it gemini-3.5-flash — editable in AI Settings)
export const DEFAULT_MODEL = 'gemini-2.5-flash';
export const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-6';

// ── Key management ─────────────────────────────────────────────

export async function getGeminiKey(): Promise<string | null> {
  return AsyncStorage.getItem(KEY_GEMINI_API);
}

export async function setGeminiKey(key: string): Promise<void> {
  await AsyncStorage.setItem(KEY_GEMINI_API, key.trim());
}

export async function clearGeminiKey(): Promise<void> {
  await AsyncStorage.removeItem(KEY_GEMINI_API);
}

export async function hasGeminiKey(): Promise<boolean> {
  const key = await getGeminiKey();
  return key != null && key.length > 10;
}

// ── Model selection ────────────────────────────────────────────

export async function getGeminiModel(): Promise<string> {
  const m = await AsyncStorage.getItem(KEY_GEMINI_MODEL);
  return m ?? DEFAULT_MODEL;
}

export async function setGeminiModel(model: string): Promise<void> {
  await AsyncStorage.setItem(KEY_GEMINI_MODEL, model.trim());
}

// ── Anthropic key management ───────────────────────────────────

export async function getAnthropicKey(): Promise<string | null> {
  return AsyncStorage.getItem(KEY_ANTHROPIC_API);
}

export async function setAnthropicKey(key: string): Promise<void> {
  await AsyncStorage.setItem(KEY_ANTHROPIC_API, key.trim());
}

export async function clearAnthropicKey(): Promise<void> {
  await AsyncStorage.removeItem(KEY_ANTHROPIC_API);
}

export async function hasAnthropicKey(): Promise<boolean> {
  const key = await getAnthropicKey();
  return key != null && key.length > 10;
}

export async function getAnthropicModel(): Promise<string> {
  const m = await AsyncStorage.getItem(KEY_ANTHROPIC_MODEL);
  return m ?? DEFAULT_ANTHROPIC_MODEL;
}

export async function setAnthropicModel(model: string): Promise<void> {
  await AsyncStorage.setItem(KEY_ANTHROPIC_MODEL, model.trim());
}

// ── Validate key with a lightweight Gemini call ────────────────

export async function validateGeminiKey(key: string, model?: string): Promise<{ok: boolean; error?: string}> {
  const m = model ?? DEFAULT_MODEL;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          contents: [{parts: [{text: 'Reply with the single word: OK'}]}],
          generationConfig: {maxOutputTokens: 4},
        }),
      },
    );
    if (res.status === 400) {
      return {ok: false, error: 'Invalid API key'};
    }
    if (res.status === 404) {
      return {ok: false, error: `Model "${m}" not found — check model name in AI Settings`};
    }
    if (!res.ok) {
      return {ok: false, error: `API error ${res.status}`};
    }
    return {ok: true};
  } catch (e: any) {
    return {ok: false, error: e?.message ?? 'Network error'};
  }
}
