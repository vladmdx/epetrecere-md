"use client";

// M9 Intern #3 — Public AI chatbot widget.
// Floating bubble in the bottom-right of every public page. Stateless:
// the full message history is kept in component state and POSTed to
// /api/ai/public-chat on each turn. Persistence is localStorage only so we
// don't need accounts / cookies.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bot, X, Send, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string };

const STORAGE_KEY = "epetrecere-public-ai-chat";

const GREETING: Msg = {
  role: "assistant",
  content:
    "Salut! Sunt asistentul ePetrecere.md. Te pot ajuta să găsești artiști, săli, să calculezi bugetul nunții sau să răspund la întrebări despre planificarea evenimentului. Cu ce te pot ajuta?",
};

const QUICK_PROMPTS = [
  "Cât costă o nuntă medie în Moldova?",
  "Cum găsesc un DJ bun?",
  "Ce include pachetul Pro?",
  "Câți invitați încap într-o sală mijlocie?",
];

/** Replace `/path` or `/path/sub` tokens in AI replies with Next <Link>. */
function renderWithLinks(text: string) {
  const parts = text.split(/(\s|,|\.|;)/);
  return parts.map((part, i) => {
    if (/^\/[a-z0-9-/]+$/i.test(part)) {
      return (
        <Link
          key={i}
          href={part}
          className="text-gold underline underline-offset-2 hover:text-gold-dark"
        >
          {part}
        </Link>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export function PublicAiChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([GREETING]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Restore conversation from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Msg[];
        if (Array.isArray(parsed) && parsed.length > 0) setMessages(parsed);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-20)));
    } catch {
      /* ignore quota errors */
    }
  }, [messages]);

  // Autoscroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  async function send(text?: string) {
    const content = (text ?? draft).trim();
    if (!content || sending) return;

    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setDraft("");
    setSending(true);

    try {
      const res = await fetch("/api/ai/public-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.slice(-12) }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.reply ?? "Îmi pare rău, ceva a mers prost.",
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Am o problemă de conexiune. Încearcă din nou în câteva secunde.",
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  function reset() {
    setMessages([GREETING]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  return (
    <>
      {/* Floating trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Închide asistentul AI" : "Deschide asistentul AI"}
        className={cn(
          "fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all hover:scale-105",
          "bg-gradient-to-br from-gold to-gold-dark text-background",
          open && "rotate-90",
        )}
      >
        {open ? <X className="h-6 w-6" /> : <Bot className="h-6 w-6" />}
      </button>

      {/* Panel */}
      {open && (
        <div
          className={cn(
            "fixed bottom-24 right-5 z-50 flex w-[92vw] max-w-sm flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-2xl",
            "h-[70vh] max-h-[560px]",
          )}
        >
          {/* Header */}
          <div className="flex items-center gap-2 border-b border-border/40 bg-gradient-to-r from-gold/10 to-transparent px-4 py-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gold/20">
              <Sparkles className="h-4 w-4 text-gold" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-heading text-sm font-bold">Asistent ePetrecere</p>
              <p className="truncate text-[11px] text-muted-foreground">
                Îți răspund în română, rusă sau engleză
              </p>
            </div>
            <button
              type="button"
              onClick={reset}
              className="text-[11px] text-muted-foreground hover:text-foreground"
              title="Conversație nouă"
            >
              Resetează
            </button>
          </div>

          {/* Messages */}
          <div
            ref={scrollRef}
            className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm"
          >
            {messages.map((m, i) => (
              <div
                key={i}
                className={cn(
                  "flex",
                  m.role === "user" ? "justify-end" : "justify-start",
                )}
              >
                <div
                  className={cn(
                    "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2",
                    m.role === "user"
                      ? "bg-gold text-background"
                      : "bg-accent/60 text-foreground",
                  )}
                >
                  {m.role === "assistant"
                    ? renderWithLinks(m.content)
                    : m.content}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl bg-accent/60 px-3 py-2 text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Scriu…
                </div>
              </div>
            )}

            {/* Quick prompts only when conversation is fresh */}
            {messages.length <= 1 && !sending && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {QUICK_PROMPTS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => send(p)}
                    className="rounded-full border border-border/60 bg-background px-3 py-1 text-[11px] text-muted-foreground transition hover:border-gold/60 hover:text-gold"
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="flex items-center gap-2 border-t border-border/40 px-3 py-2"
          >
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Scrie un mesaj…"
              className="flex-1 rounded-lg border border-border/40 bg-background px-3 py-2 text-sm outline-none focus:border-gold"
              maxLength={500}
              disabled={sending}
            />
            <Button
              type="submit"
              size="icon"
              disabled={sending || !draft.trim()}
              className="h-9 w-9 shrink-0 bg-gold text-background hover:bg-gold-dark"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </form>
        </div>
      )}
    </>
  );
}
