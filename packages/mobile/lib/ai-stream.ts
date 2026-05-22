// SSE consumer for the AI streaming chat endpoint.
//
// react-native-sse wraps EventSource for RN (which doesn't ship one
// natively — both iOS and Android use long-polling fetch under the
// hood otherwise). We expose a small `streamAiChat()` async generator
// so call sites can `for await (const token of streamAiChat(...))`
// and feel like they're consuming a native stream.
//
// Cancellation: pass an AbortSignal — when fired we close the
// EventSource and exit the generator cleanly.

import EventSource from "react-native-sse";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

interface StreamOptions {
  apiUrl: string;
  token: string;
  messages: ChatTurn[];
  context: "client_assistant" | "partner_assistant";
  signal?: AbortSignal;
}

export interface StreamEvent {
  type: "token" | "done" | "error";
  text?: string;
  message?: string;
  usage?: { input_tokens: number; output_tokens: number };
}

export async function* streamAiChat(
  opts: StreamOptions,
): AsyncGenerator<StreamEvent> {
  // react-native-sse only supports GET by default. Workaround: it
  // accepts `method` + `body` for POST as of v1.2. Manually parse
  // events ourselves rather than `addEventListener("token", ...)`
  // because that doesn't fit the async-iterator model nicely.

  const url = `${opts.apiUrl}/ai/chat/stream`;
  const queue: StreamEvent[] = [];
  let resolveNext: ((value: StreamEvent | null) => void) | null = null;
  let done = false;

  // react-native-sse v1 types the event types via a generic. We tell
  // it our custom event names so addEventListener accepts "token" /
  // "done" without complaint.
  const es = new EventSource<"token" | "done" | "error">(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.token}`,
      Accept: "text/event-stream",
    },
    body: JSON.stringify({
      messages: opts.messages,
      context: opts.context,
    }),
    // Disable auto-reconnect — once the stream completes we close.
    pollingInterval: 0,
  });

  function push(ev: StreamEvent) {
    if (resolveNext) {
      const r = resolveNext;
      resolveNext = null;
      r(ev);
    } else {
      queue.push(ev);
    }
  }

  es.addEventListener("token", (e) => {
    try {
      const data = JSON.parse((e as unknown as { data: string }).data);
      push({ type: "token", text: data.text });
    } catch {
      // Ignore malformed events.
    }
  });
  es.addEventListener("done", (e) => {
    try {
      const data = JSON.parse((e as unknown as { data: string }).data);
      push({ type: "done", usage: data.usage });
    } catch {
      push({ type: "done" });
    }
    done = true;
    if (resolveNext) {
      const r = resolveNext;
      resolveNext = null;
      r(null);
    }
    es.close();
  });
  es.addEventListener("error", (e) => {
    const message =
      (e as unknown as { message?: string }).message ?? "stream_error";
    push({ type: "error", message });
    done = true;
    if (resolveNext) {
      const r = resolveNext;
      resolveNext = null;
      r(null);
    }
    es.close();
  });

  const onAbort = () => {
    done = true;
    es.close();
    if (resolveNext) {
      const r = resolveNext;
      resolveNext = null;
      r(null);
    }
  };
  if (opts.signal) {
    if (opts.signal.aborted) onAbort();
    else opts.signal.addEventListener("abort", onAbort);
  }

  try {
    while (true) {
      if (queue.length > 0) {
        const ev = queue.shift()!;
        yield ev;
        if (ev.type === "done" || ev.type === "error") return;
        continue;
      }
      if (done) return;
      const next = await new Promise<StreamEvent | null>((resolve) => {
        resolveNext = resolve;
      });
      if (next === null) return;
      yield next;
      if (next.type === "done" || next.type === "error") return;
    }
  } finally {
    if (opts.signal) opts.signal.removeEventListener("abort", onAbort);
    es.close();
  }
}
