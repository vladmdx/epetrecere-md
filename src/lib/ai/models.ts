// Single source of truth for AI model IDs.
//
// Previously every route/function hardcoded its own model string, which had
// drifted: some paths ran Sonnet 4.0 (dated) while others ran the Sonnet 4.5
// alias. Centralizing here unifies them and makes a version bump a one-line
// change. To pin for reproducibility, swap CHAT to a dated snapshot id.
export const MODELS = {
  /** Conversational + generation tasks (assistants, chat, search, pricing…). */
  CHAT: "claude-sonnet-4-5",
  /** Cheap classification / parsing tasks. */
  FAST: "claude-haiku-4-5",
  /** OpenAI speech-to-text (the only non-Anthropic model). */
  TRANSCRIBE: "whisper-1",
} as const;

export type ModelId = (typeof MODELS)[keyof typeof MODELS];
