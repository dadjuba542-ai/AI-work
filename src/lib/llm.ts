export type LLMRole = "system" | "user" | "assistant" | "tool";

export interface LLMMessage {
  role: LLMRole;
  content: string | null;
  images?: Array<{ type: string; data: string }>;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
  name?: string;
}

export interface ToolDef {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface LLMResponse {
  content: string | null;
  think?: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
}

function stripInternal(msg: LLMMessage): Record<string, unknown> {
  if (msg.role === "tool") {
    return { role: "tool", tool_call_id: msg.tool_call_id, content: msg.content };
  }
  if (msg.role === "assistant" && msg.tool_calls) {
    return { role: "assistant", content: msg.content, tool_calls: msg.tool_calls };
  }
  if (msg.images && msg.images.length > 0 && msg.role === "user") {
    const parts: Array<{ type: "text"; text: string | null } | { type: "image_url"; image_url: { url: string } }> =
      msg.content ? [{ type: "text", text: msg.content }] : [];
    for (const img of msg.images) {
      parts.push({ type: "image_url", image_url: { url: `data:${img.type};base64,${img.data}` } });
    }
    return { role: "user", content: parts };
  }
  return { role: msg.role, content: msg.content };
}

async function llmFetchOpenAI(body: Record<string, unknown>, apiKey: string, baseUrl: string) {
  const url = `${baseUrl}/v1/chat/completions`;
  const bodyStr = JSON.stringify(body);
  const msgCount = Array.isArray(body.messages) ? body.messages.length : 0;
  const toolCount = Array.isArray(body.tools) ? body.tools.length : 0;
  console.log(`[LLM] POST ${url} | model=${String(body.model || "")} | messages=${msgCount} | tools=${toolCount}`);
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: bodyStr,
  });
}

function parseOpenAI(respText: string): LLMResponse {
  const data = JSON.parse(respText) as {
    choices?: Array<{ message?: { content?: string | null; tool_calls?: LLMResponse["tool_calls"] } }>;
  };
  const choice = data.choices?.[0];
  if (!choice) throw new Error("No response choices");
  const raw = choice.message?.content || null;
  let think: string | null = null;
  let content: string | null = null;
  if (raw) {
    const m = raw.match(/<think>([\s\S]*?)<\/think>/);
    if (m) { think = m[1].trim(); content = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim(); }
    else { content = raw; }
  }
  return { content, think, tool_calls: choice.message?.tool_calls };
}

// --- Main entry ---

export async function callLLM(
  messages: LLMMessage[],
  options: {
    apiKey: string;
    baseUrl: string;
    model: string;
    temperature: number;
    tools?: ToolDef[];
  }
): Promise<LLMResponse> {
  const { apiKey, baseUrl, model, temperature, tools } = options;
  const body: Record<string, unknown> = { model, messages: messages.map(stripInternal), temperature };
  if (tools && tools.length > 0) { body.tools = tools; body.tool_choice = "auto"; }

  const response = await llmFetchOpenAI(body, apiKey, baseUrl);
  const respText = await response.text();
  console.log(`[LLM] Response ${response.status} | ${respText.slice(0, 300)}`);

  if (!response.ok) throw new Error(`LLM API error (${response.status}): ${respText}`);
  return parseOpenAI(respText);
}
