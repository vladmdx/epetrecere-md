import Anthropic from "@anthropic-ai/sdk";

const OPENAI_FALLBACK_MODEL =
  process.env.OPENAI_FALLBACK_MODEL || "gpt-5.6-terra";
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const ANTHROPIC_RETRY_MS = 5 * 60 * 1000;

let anthropicClient: Anthropic | null = null;
let anthropicUnavailableUntil = 0;

type OpenAiMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
};

function anthropic() {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropicClient;
}

function textFromBlockContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return JSON.stringify(content ?? "");
  return content
    .map((block) => {
      if (
        block &&
        typeof block === "object" &&
        "type" in block &&
        block.type === "text" &&
        "text" in block
      ) {
        return String(block.text);
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function systemText(
  system: Anthropic.Messages.MessageCreateParamsNonStreaming["system"],
): string {
  if (!system) return "";
  if (typeof system === "string") return system;
  return system
    .map((block) => (block.type === "text" ? block.text : ""))
    .filter(Boolean)
    .join("\n\n");
}

function toOpenAiMessages(
  params: Anthropic.Messages.MessageCreateParamsNonStreaming,
): OpenAiMessage[] {
  const result: OpenAiMessage[] = [];
  const system = systemText(params.system);
  if (system) result.push({ role: "system", content: system });

  for (const message of params.messages) {
    if (typeof message.content === "string") {
      result.push({ role: message.role, content: message.content });
      continue;
    }

    if (message.role === "assistant") {
      const text = message.content
        .filter((block) => block.type === "text")
        .map((block) => (block.type === "text" ? block.text : ""))
        .filter(Boolean)
        .join("\n");
      const toolCalls = message.content
        .filter(
          (block): block is Anthropic.Messages.ToolUseBlock =>
            block.type === "tool_use",
        )
        .map((block) => ({
          id: block.id,
          type: "function" as const,
          function: {
            name: block.name,
            arguments: JSON.stringify(block.input ?? {}),
          },
        }));
      result.push({
        role: "assistant",
        content: text || null,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      });
      continue;
    }

    const userText = message.content
      .filter((block) => block.type === "text")
      .map((block) => (block.type === "text" ? block.text : ""))
      .filter(Boolean)
      .join("\n");
    if (userText) result.push({ role: "user", content: userText });

    for (const block of message.content) {
      if (block.type !== "tool_result") continue;
      result.push({
        role: "tool",
        tool_call_id: block.tool_use_id,
        content: textFromBlockContent(block.content),
      });
    }
  }

  return result;
}

function shouldPauseAnthropic(error: unknown): boolean {
  const status =
    error && typeof error === "object" && "status" in error
      ? Number(error.status)
      : 0;
  const text =
    error instanceof Error
      ? error.message.toLowerCase()
      : JSON.stringify(error).toLowerCase();
  return (
    [401, 402, 403, 429, 500, 502, 503, 529].includes(status) ||
    text.includes("credit balance") ||
    text.includes("billing") ||
    text.includes("authentication") ||
    text.includes("api key is invalid") ||
    text.includes("overloaded") ||
    text.includes("rate_limit") ||
    text.includes("529")
  );
}

async function openAiMessage(
  params: Anthropic.Messages.MessageCreateParamsNonStreaming,
): Promise<Anthropic.Messages.Message> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("No funded AI provider is configured");

  const tools = (params.tools ?? []).flatMap((tool) => {
    if (!("name" in tool) || !("input_schema" in tool)) return [];
    return [
      {
        type: "function" as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.input_schema,
        },
      },
    ];
  });

  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_FALLBACK_MODEL,
      messages: toOpenAiMessages(params),
      max_completion_tokens: params.max_tokens,
      reasoning_effort: "none",
      ...(tools.length > 0 ? { tools, tool_choice: "auto" } : {}),
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    const code = payload?.error?.code || payload?.error?.type || response.status;
    throw new Error(`OpenAI fallback failed (${code})`);
  }

  const choice = payload?.choices?.[0];
  const message = choice?.message;
  const content: Anthropic.Messages.ContentBlock[] = [];
  if (message?.content) {
    content.push({
      type: "text",
      text: String(message.content),
      citations: null,
    });
  }
  for (const call of message?.tool_calls ?? []) {
    let input: unknown = {};
    try {
      input = JSON.parse(call.function?.arguments || "{}");
    } catch {
      input = {};
    }
    content.push({
      type: "tool_use",
      id: call.id,
      name: call.function?.name || "unknown_tool",
      input,
      caller: { type: "direct" },
    });
  }

  return {
    id: payload.id || `openai-${Date.now()}`,
    type: "message",
    role: "assistant",
    content,
    model: payload.model || OPENAI_FALLBACK_MODEL,
    stop_reason:
      (message?.tool_calls?.length ?? 0) > 0 ? "tool_use" : "end_turn",
    stop_sequence: null,
    usage: {
      input_tokens: payload.usage?.prompt_tokens ?? 0,
      output_tokens: payload.usage?.completion_tokens ?? 0,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
    },
  } as Anthropic.Messages.Message;
}

async function createMessage(
  params: Anthropic.Messages.MessageCreateParamsNonStreaming,
): Promise<Anthropic.Messages.Message> {
  if (process.env.ANTHROPIC_API_KEY && Date.now() >= anthropicUnavailableUntil) {
    try {
      return await anthropic().messages.create(params);
    } catch (error) {
      if (!shouldPauseAnthropic(error)) throw error;
      anthropicUnavailableUntil = Date.now() + ANTHROPIC_RETRY_MS;
      console.warn(
        "[ai/provider] Anthropic unavailable; using configured OpenAI fallback",
      );
    }
  }
  return openAiMessage(params);
}

const compatibleClient = {
  messages: { create: createMessage },
};

/**
 * Anthropic-compatible subset used by the existing assistants. It preserves
 * their tool loops and response shape, but transparently uses the configured
 * OpenAI provider when Anthropic is unfunded or temporarily unavailable.
 */
export function getAiClient(): Anthropic {
  return compatibleClient as unknown as Anthropic;
}
