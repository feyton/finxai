/**
 * Gemini → Claude tool-use shape translation for the Finance Coach.
 *
 * WHY: the coach's agentic loop on mobile (src/screens/AIChatScreen.tsx via
 * chatTools) is written against Claude's wire format — `{stopReason, content}`
 * where content carries `tool_use` blocks, and tool results come back as
 * `tool_result` blocks in a user turn. Now that the provider is the user's
 * choice and must serve BOTH jobs, the Gemini path has to speak that same
 * shape, or every caller would need two code paths.
 *
 * Translating here keeps the mobile client provider-agnostic: it always sees
 * Claude-shaped turns regardless of who answered.
 */

type ClaudeBlock =
  | {type: 'text'; text: string}
  | {type: 'tool_use'; id: string; name: string; input: unknown}
  | {type: 'tool_result'; tool_use_id: string; content: unknown; is_error?: boolean};

interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string | ClaudeBlock[];
}

/** Claude tool definitions → Gemini functionDeclarations. */
export function toGeminiTools(tools: any[]): any[] {
  if (!tools?.length) {
    return [];
  }
  return [
    {
      functionDeclarations: tools.map(t => ({
        name: t.name,
        description: t.description ?? '',
        parameters: stripUnsupported(t.input_schema ?? {type: 'object', properties: {}}),
      })),
    },
  ];
}

/**
 * Gemini rejects several JSON-Schema keywords outright, and its `type` is
 * uppercase. Passing a Claude `input_schema` through unchanged 400s.
 */
function stripUnsupported(node: any): any {
  if (!node || typeof node !== 'object') {
    return node;
  }
  if (Array.isArray(node)) {
    return node.map(stripUnsupported);
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
      Object.entries(node.properties).map(([k, v]) => [k, stripUnsupported(v)]),
    );
  }
  if (node.required) {
    out.required = node.required;
  }
  if (node.items) {
    out.items = stripUnsupported(node.items);
  }
  return out;
}

/**
 * Claude message history → Gemini `contents`.
 *
 * The fiddly part is tool results: Claude carries them as `tool_result` blocks
 * inside a *user* turn, Gemini expects `functionResponse` parts in a turn with
 * role 'user'. Tool NAME is required by Gemini but Claude's tool_result only
 * carries the tool_use_id, so we resolve the name from the preceding
 * assistant turn's tool_use block.
 */
export function toGeminiContents(messages: ClaudeMessage[]): any[] {
  const idToName = new Map<string, string>();
  const contents: any[] = [];

  for (const m of messages) {
    const blocks: ClaudeBlock[] =
      typeof m.content === 'string' ? [{type: 'text', text: m.content}] : m.content ?? [];

    // Remember tool_use ids so a later tool_result can name its function.
    for (const b of blocks) {
      if (b.type === 'tool_use') {
        idToName.set(b.id, b.name);
      }
    }

    const parts: any[] = [];
    for (const b of blocks) {
      if (b.type === 'text') {
        if (b.text) {
          parts.push({text: b.text});
        }
      } else if (b.type === 'tool_use') {
        parts.push({functionCall: {name: b.name, args: b.input ?? {}}});
      } else if (b.type === 'tool_result') {
        const name = idToName.get(b.tool_use_id) ?? 'unknown_tool';
        parts.push({
          functionResponse: {
            name,
            // Gemini wants an object; Claude tool results are often strings.
            response:
              typeof b.content === 'string'
                ? {result: b.content}
                : (b.content as object) ?? {},
          },
        });
      }
    }
    if (parts.length) {
      contents.push({role: m.role === 'assistant' ? 'model' : 'user', parts});
    }
  }
  return contents;
}

/** Gemini candidate → Claude `{stopReason, content}`. */
export function fromGeminiResponse(data: any): {stopReason: string; content: ClaudeBlock[]} {
  const parts: any[] = data?.candidates?.[0]?.content?.parts ?? [];
  const content: ClaudeBlock[] = [];
  let sawToolCall = false;

  parts.forEach((p, i) => {
    if (p.text) {
      content.push({type: 'text', text: p.text});
    }
    if (p.functionCall) {
      sawToolCall = true;
      content.push({
        type: 'tool_use',
        // Claude ids are opaque to the client; a stable synthetic one is fine
        // because the loop only echoes it back in the matching tool_result.
        id: `gem_${Date.now()}_${i}`,
        name: p.functionCall.name,
        input: p.functionCall.args ?? {},
      });
    }
  });

  return {stopReason: sawToolCall ? 'tool_use' : 'end_turn', content};
}
