"use client";

// Chat widget for the AI calendar-fill assistant. The artist types in
// natural language, Claude asks follow-up questions or calls the
// create_slots tool server-side. On success the parent re-fetches its
// slot list via onSlotsCreated().

import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Sparkles, Send, Loader2, Bot } from "lucide-react";
import { useLocale } from "@/hooks/use-locale";
import { plural, type AllForms } from "@/lib/i18n/plural";

/** "slot" needs three Russian forms, which a flat dictionary cannot hold. */
const SLOTS: AllForms = {
  ro: { one: "slot", few: "sloturi", many: "sloturi" },
  ru: { one: "слот", few: "слота", many: "слотов" },
  en: { one: "slot", other: "slots" },
};

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string };

type Message = {
  role: "user" | "assistant";
  content: string | ContentBlock[];
};

export function AICalendarChat({
  onSlotsCreated,
}: {
  /** Fired after the server confirms it persisted new slots so the
   *  parent can re-fetch its list. */
  onSlotsCreated: () => void;
}) {
  const { t, locale } = useLocale();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;

    const optimistic: Message = { role: "user", content: text };
    const nextMessages = [...messages, optimistic];
    setMessages(nextMessages);
    setInput("");
    setBusy(true);

    try {
      const res = await fetch("/api/ai/artist-calendar-fill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || t("vendor.aiChat.errAi"));
        // Roll back the optimistic user message.
        setMessages(messages);
        return;
      }
      const data: { messages: Message[]; slotsCreated: number } = await res.json();
      setMessages(data.messages);
      if (data.slotsCreated > 0) {
        toast.success(
          t("vendor.aiChat.slotsAdded", {
            slots: plural(data.slotsCreated, locale, SLOTS),
          }),
        );
        onSlotsCreated();
      }
    } catch {
      toast.error(t("vendor.aiChat.errNetwork"));
      setMessages(messages);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Sparkles className="h-4 w-4 text-gold" />
          {t("vendor.aiChat.title")}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {t("vendor.aiChat.subtitle")}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div
          ref={scrollRef}
          className="max-h-80 min-h-32 space-y-2 overflow-y-auto rounded-lg border border-border/30 bg-background/50 p-3"
        >
          {messages.length === 0 ? (
            <div className="space-y-3 py-2">
              <div className="flex items-start gap-2 text-sm text-muted-foreground">
                <Bot className="h-4 w-4 mt-0.5 text-gold shrink-0" />
                <p>
                  {t("vendor.aiChat.exampleLabel")}{" "}
                  <em>&ldquo;{t("vendor.aiChat.exampleText")}&rdquo;</em>
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  t("vendor.aiChat.suggest1"),
                  t("vendor.aiChat.suggest2"),
                  t("vendor.aiChat.suggest3"),
                ].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setInput(s)}
                    className="rounded-full border border-border/30 bg-accent/30 px-2.5 py-1 text-[11px] hover:border-gold/40 hover:bg-gold/10"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) => {
              const isUser = m.role === "user";
              const textParts =
                typeof m.content === "string"
                  ? [m.content]
                  : m.content
                      .filter((b): b is Extract<ContentBlock, { type: "text" }> => b.type === "text")
                      .map((b) => b.text);
              const toolCalls =
                typeof m.content === "string"
                  ? []
                  : m.content.filter(
                      (b): b is Extract<ContentBlock, { type: "tool_use" }> => b.type === "tool_use",
                    );
              if (textParts.length === 0 && toolCalls.length === 0) return null;
              return (
                <div
                  key={i}
                  className={`flex gap-2 ${isUser ? "justify-end" : "justify-start"}`}
                >
                  {!isUser && (
                    <Bot className="h-4 w-4 mt-1.5 text-gold shrink-0" />
                  )}
                  <div
                    className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                      isUser
                        ? "bg-gold/10 text-foreground"
                        : "bg-accent/40 text-foreground"
                    }`}
                  >
                    {textParts.map((part, j) => (
                      <p key={j} className="whitespace-pre-wrap">
                        {part}
                      </p>
                    ))}
                    {toolCalls.map((tc) => {
                      const input = tc.input as {
                        slots?: Array<{
                          date: string;
                          startTime: string;
                          endTime: string;
                        }>;
                      };
                      const count = input.slots?.length ?? 0;
                      return (
                        <p
                          key={tc.id}
                          className="mt-1 text-xs italic text-gold"
                        >
                          ⚡{" "}
                          {t("vendor.aiChat.creatingSlots", {
                            slots: plural(count, locale, SLOTS),
                          })}
                        </p>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
          {busy && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin text-gold" />
              {t("vendor.aiChat.thinking")}
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t("vendor.aiChat.inputPlaceholder")}
            disabled={busy}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <Button
            onClick={send}
            disabled={busy || !input.trim()}
            className="gap-1 bg-gold text-[#0D0D0D] hover:bg-gold-dark"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>

        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => setMessages([])}
            className="text-[11px] text-muted-foreground hover:text-gold"
          >
            {t("vendor.aiChat.newConversation")}
          </button>
        )}
      </CardContent>
    </Card>
  );
}
