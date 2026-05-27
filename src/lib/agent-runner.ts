import { callLLM, LLMMessage, ToolDef, LLMResponse } from "@/lib/llm";
import { getToolHandler, getToolList } from "@/lib/tools";

export interface ToolCallEvent {
  id: string;
  name: string;
  input: string;
  output: string;
  ok: boolean;
  durationMs: number;
}

export interface AgentResult {
  content: string;
  think: string | null;
  toolCalls: ToolCallEvent[];
}

export async function runAgent(
  messages: LLMMessage[],
  options: {
    apiKey: string;
    baseUrl: string;
    model: string;
    temperature: number;
    maxIterations: number;
    toolNames?: string[];
  }
): Promise<AgentResult> {
  const { apiKey, baseUrl, model, temperature, maxIterations, toolNames } = options;

  const allTools = getToolList();
  const enabledTools: ToolDef[] = toolNames
    ? allTools.filter((t) => toolNames.includes(t.function.name))
    : allTools;

  const toolCalls: ToolCallEvent[] = [];
  let firstResponse = true;
  let thinkAccum = "";

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const response = await callLLM(messages, {
      apiKey,
      baseUrl,
      model,
      temperature,
      tools: enabledTools.length > 0 ? enabledTools : undefined,
    });

    if (response.think) thinkAccum += (thinkAccum ? "\n" : "") + response.think;

    // Fallback: if first response has no tool calls and content is short,
    // hint about available skills/tools
    if (firstResponse && toolNames && toolNames.includes("load_skill") &&
        (!response.tool_calls || response.tool_calls.length === 0) &&
        (response.content?.length || 0) < 200) {
      const skillsHint = toolNames
        .filter((t) => t !== "load_skill" && t !== "discover_skill_files")
        .join(", ");
      messages.push({
        role: "user" as const,
        content: `[Hint] The user's request might match available skills. Consider checking with load_skill(). Available: ${toolNames.filter(t => t !== 'load_skill' && t !== 'discover_skill_files').join(", ")}`,
      });
      firstResponse = false;
      continue;
    }
    firstResponse = false;

    if (response.tool_calls && response.tool_calls.length > 0) {
      const assistantMsg: LLMMessage = {
        role: "assistant",
        content: response.content,
        tool_calls: response.tool_calls,
      };
      messages.push(assistantMsg);

      for (const tc of response.tool_calls) {
        const handler = getToolHandler(tc.function.name);
        const start = Date.now();
        let output: string;
        let ok = true;

        try {
          const args = JSON.parse(tc.function.arguments);
          if (handler) {
            output = await handler(args);
          } else {
            output = `Unknown tool: ${tc.function.name}`;
            ok = false;
          }
        } catch (err: any) {
          output = err.message || String(err);
          ok = false;
        }

        const durationMs = Date.now() - start;

        toolCalls.push({
          id: tc.id,
          name: tc.function.name,
          input: tc.function.arguments,
          output,
          ok,
          durationMs,
        });

        // Inject skill content when load_skill succeeds
        if (tc.function.name === "load_skill" && ok) {
          try {
            const parsed = JSON.parse(output);
            if (parsed.loaded) {
              const filesSection = parsed.files
                ? `\n\n## Skill Files\n\`\`\`\n${parsed.files}\n\`\`\`\nUse \`discover_skill_files\` to refresh this list. Read files with \`read_file\` and run scripts with \`shell_exec\`.`
                : "";
              messages.push({
                role: "user" as const,
                content: `[System: Loaded Skill "${parsed.name}"]\n\n${parsed.prompt}${filesSection}\n\nSkill directory: ${parsed.dir}\nUse shell_exec with workdir="${parsed.dir}" to run scripts.\nUse read_file with path="${parsed.dir}/filename" to read docs.\n[/System]`,
              });
            }
          } catch {}
        }

        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          name: tc.function.name,
          content: output,
        });
      }

      continue;
    }

    return {
      content: response.content || "",
      think: thinkAccum || null,
      toolCalls,
    };
  }

  return {
    content: messages[messages.length - 1]?.content || "(max iterations reached)",
    think: thinkAccum || null,
    toolCalls,
  };
}
