"use client";

// AI assistant surfaced inside the "Rezervări Artiști" tab. The client
// asks in natural language ("recomandă-mi top 3 DJ cu rating 4+") and
// Claude lists options from DB → user confirms → booking requests get
// sent automatically via the planner-linked endpoint.

import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Sparkles, Send, Loader2, Bot, Wand2 } from "lucide-react";

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string };

type Message = {
  role: "user" | "assistant";
  content: string | ContentBlock[];
};

export function AIArtistPickerChat({
  eventPlanId,
  onBookingsCreated,
}: {
  eventPlanId: number;
  /** Parent refreshes the bookings list after the AI sends requests. */
  onBookingsCreated: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
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
      const res = await fetch("/api/ai/client-artist-picker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages,
          eventPlanId,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Eroare AI.");
        setMessages(messages);
        return;
      }
      const data: { messages: Message[]; requestsSent: number } = await res.json();
      setMessages(data.messages);
      if (data.requestsSent > 0) {
        toast.success(`Am trimis ${data.requestsSent} cereri de rezervare.`);
        onBookingsCreated();
      }
    } catch {
      toast.error("Eroare de rețea.");
      setMessages(messages);
    } finally {
      setBusy(false);
    }
  }

  // Collapsed CTA — clicking expands the full chat. Keeps the tab from
  // feeling crowded if the user doesn't want AI help.
  if (!open) {
    return (
      <Card
        className="cursor-pointer border-dashed border-gold/30 bg-gold/5 transition-all hover:border-gold/50 hover:bg-gold/10"
        onClick={() => setOpen(true)}
      >
        <CardContent className="flex items-center gap-3 py-4">
          <Wand2 className="h-5 w-5 text-gold" />
          <div className="flex-1">
            <p className="text-sm font-medium">Cere AI să-ți aleagă artiștii</p>
            <p className="text-xs text-muted-foreground">
              Ex: &ldquo;Găsește-mi top 3 DJ cu rating 4+ pentru data mea&rdquo;
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="gap-1 border-gold/30 text-gold hover:bg-gold/10"
          >
            <Sparkles className="h-3.5 w-3.5" /> Deschide
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-4 w-4 text-gold" />
            Asistent AI
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Filtrez artiști, îi prezint, apoi trimit cereri la confirmarea ta.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Închide
        </button>
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
                  Îți pot recomanda artiști pe baza bugetului, rating-ului și
                  categoriilor. Spune-mi ce cauți.
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  "Top 3 artiști ieftini cu rating 4+",
                  "Cei mai bine cotați fotografi pentru data mea",
                  "DJ sub 300€ cu rating peste 4.5",
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
                      .filter(
                        (b): b is Extract<ContentBlock, { type: "text" }> =>
                          b.type === "text",
                      )
                      .map((b) => b.text);
              const toolCalls =
                typeof m.content === "string"
                  ? []
                  : m.content.filter(
                      (b): b is Extract<ContentBlock, { type: "tool_use" }> =>
                        b.type === "tool_use",
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
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                      isUser
                        ? "bg-gold/10 text-foreground"
                        : "bg-accent/40 text-foreground"
                    }`}
                  >
                    {textParts.map((t, j) => (
                      <p key={j} className="whitespace-pre-wrap">
                        {t}
                      </p>
                    ))}
                    {toolCalls.map((tc) => {
                      const label =
                        tc.name === "list_available_artists"
                          ? "🔎 Caut artiști…"
                          : tc.name === "send_booking_requests"
                            ? "📨 Trimit cereri…"
                            : `🛠️ ${tc.name}`;
                      return (
                        <p
                          key={tc.id}
                          className="mt-1 text-xs italic text-gold"
                        >
                          {label}
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
              Caut / mă gândesc…
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ex: caută-mi DJ ieftini cu rating 4+"
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
            className="gap-1 bg-gold text-background hover:bg-gold-dark"
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
            Începe conversație nouă
          </button>
        )}
      </CardContent>
    </Card>
  );
}
