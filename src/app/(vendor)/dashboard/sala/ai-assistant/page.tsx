"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Send, Loader2, Sparkles, User } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Message = {
  role: "user" | "assistant";
  content: string | Array<{ type: string; text?: string }>;
};

const SUGGESTIONS = [
  "Ce rezervări am luna viitoare?",
  "Care e rata mea de ocupare pe vara asta?",
  "Sugerează-mi un preț competitiv",
  "Blochează-mi 1-10 ianuarie pentru renovări",
  "Cine a rezervat pentru weekend-ul următor?",
];

export default function VenueAIAssistantPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    setInput("");

    const newMsgs: Message[] = [
      ...messages,
      { role: "user", content },
    ];
    setMessages(newMsgs);
    setLoading(true);

    try {
      const res = await fetch("/api/ai/venue-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMsgs }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Eroare");
      }
      const data = await res.json();
      setMessages(data.messages || newMsgs);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Eroare");
    } finally {
      setLoading(false);
    }
  }

  function renderContent(content: Message["content"]): string {
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content
        .map((b) => (b.type === "text" ? b.text || "" : ""))
        .filter(Boolean)
        .join("\n");
    }
    return "";
  }

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col gap-4">
      <div>
        <h1 className="font-heading text-2xl font-bold">AI Assistant</h1>
        <p className="text-muted-foreground">
          Asistent AI specializat pentru gestionarea sălii. Întrebă-l orice despre rezervări, ocupare, prețuri sau calendar.
        </p>
      </div>

      <Card className="flex flex-1 flex-col overflow-hidden">
        <CardContent className="flex flex-1 flex-col gap-4 p-5">
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto space-y-3 pr-1"
          >
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-4 py-8">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gold/10 text-gold">
                  <Bot className="h-8 w-8" />
                </div>
                <div className="text-center">
                  <h2 className="font-heading text-lg font-bold">
                    Salut! Cu ce te pot ajuta?
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Încearcă una dintre sugestiile de mai jos sau întreabă-mă direct.
                  </p>
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="rounded-full border border-gold/30 bg-gold/5 px-3 py-1.5 text-xs text-gold transition-colors hover:bg-gold/10"
                    >
                      <Sparkles className="mr-1 inline h-3 w-3" />
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages
                .filter((m) => {
                  const text = renderContent(m.content);
                  return text.trim().length > 0;
                })
                .map((m, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex gap-3",
                      m.role === "user" ? "justify-end" : "justify-start",
                    )}
                  >
                    {m.role === "assistant" && (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold/10 text-gold">
                        <Bot className="h-4 w-4" />
                      </div>
                    )}
                    <div
                      className={cn(
                        "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap",
                        m.role === "user"
                          ? "bg-gold text-background"
                          : "bg-accent/50",
                      )}
                    >
                      {renderContent(m.content)}
                    </div>
                    {m.role === "user" && (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/50">
                        <User className="h-4 w-4" />
                      </div>
                    )}
                  </div>
                ))
            )}
            {loading && (
              <div className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold/10 text-gold">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="rounded-2xl bg-accent/50 px-4 py-2.5">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
          </div>

          <div className="flex items-end gap-2 border-t border-border/30 pt-4">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Scrie un mesaj..."
              rows={1}
              className="flex-1 resize-none"
              disabled={loading}
            />
            <Button
              onClick={() => send()}
              disabled={!input.trim() || loading}
              className="bg-gold text-background hover:bg-gold-dark"
              size="icon"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
