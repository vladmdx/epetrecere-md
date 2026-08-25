"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useUser } from "@clerk/nextjs";
import { MessageCircle, X, Send, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import LocaleLink, { useLocalizePath } from "@/components/shared/locale-link";
import { toast } from "sonner";
import { useLocale } from "@/hooks/use-locale";

// M0b #10 — Persistent pre-booking chat widget.
// Uses a React Portal so the modal escapes any sticky/overflow parent.

type ChatMessage = {
  id: number;
  senderType: string;
  senderName: string;
  message: string;
  createdAt: string;
};

interface Props {
  /** Either artistId or venueId — exactly one. */
  artistId?: number;
  venueId?: number;
  /** Display name shown in the chat header + empty state. */
  artistName: string;
  /** Slug used for the sign-in redirect link. */
  artistSlug: string;
  /** Override the route prefix used in the sign-in redirect (defaults to /artisti/). */
  slugPrefix?: "artisti" | "sali";
}

export function ChatWidget({
  artistId,
  venueId,
  artistName,
  artistSlug,
  slugPrefix = "artisti",
}: Props) {
  const { t } = useLocale();
  const { isSignedIn, isLoaded } = useUser();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const localize = useLocalizePath();
  const isVenueChat = Boolean(venueId);

  useEffect(() => {
    setMounted(true);
  }, []);

  async function openChat() {
    setOpen(true);
    if (conversationId || !isSignedIn) return;

    setLoading(true);
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          artistId ? { artistId } : { venueId },
        ),
      });
      if (!res.ok) throw new Error("Failed to start conversation");
      const data = await res.json();
      setConversationId(data.id);
      const msgsRes = await fetch(`/api/conversations/${data.id}/messages`);
      const msgs = await msgsRes.json();
      setMessages(Array.isArray(msgs) ? msgs : []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  async function send() {
    const text = draft.trim();
    if (!text || !conversationId || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || t("chat.sendFailed"));
      }
      const inserted = await res.json();
      setMessages((prev) => [...prev, inserted]);
      setDraft("");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("chat.sendFailed"),
      );
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open]);

  if (!isLoaded) return null;

  if (!isSignedIn) {
    return (
      // The redirect_url is prefixed as well: a localized /ru/sign-in that
      // returns to the bare profile URL drops the language on the way back.
      <LocaleLink
        href={`/sign-in?redirect_url=${encodeURIComponent(localize(`/${slugPrefix}/${artistSlug}`))}`}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-gold/30 bg-gold/10 px-4 py-2.5 text-sm font-medium text-gold hover:bg-gold/20"
      >
        <Lock className="h-4 w-4" />{" "}
        {t(isVenueChat ? "chat.signInVenue" : "chat.signInArtist")}
      </LocaleLink>
    );
  }

  const chatModal = open && mounted
    ? createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-end justify-end bg-black/50 p-0 sm:p-6"
          onClick={() => setOpen(false)}
        >
          <div
            className="flex h-[100dvh] w-full flex-col overflow-hidden border border-border/40 bg-card shadow-2xl sm:h-[600px] sm:max-h-[80vh] sm:w-[400px] sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between border-b border-border/40 bg-background/60 px-4 py-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {t("chat.header")}
                </p>
                <p className="font-heading text-sm font-bold">{artistName}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label={t("chat.close")}
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div
              ref={scrollRef}
              className="flex-1 space-y-2 overflow-y-auto bg-background/30 p-4"
            >
              {loading ? (
                <div className="flex h-full items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-gold" />
                </div>
              ) : messages.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted-foreground">
                  {t(isVenueChat ? "chat.emptyVenue" : "chat.emptyArtist")}
                </p>
              ) : (
                messages.map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      "flex flex-col gap-0.5 rounded-2xl px-3 py-2 text-sm",
                      m.senderType === "client"
                        ? "ml-8 bg-gold text-[#0D0D0D]"
                        : "mr-8 bg-accent/60 text-foreground",
                    )}
                  >
                    <span className="text-[10px] font-semibold opacity-70">
                      {m.senderName}
                    </span>
                    <span className="whitespace-pre-wrap break-words">
                      {m.message}
                    </span>
                  </div>
                ))
              )}
            </div>

            <div className="flex items-center gap-2 border-t border-border/40 bg-background/60 p-3">
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder={t("chat.inputPlaceholder")}
                className="flex-1 rounded-full border border-border/40 bg-background px-4 py-2 text-sm focus:border-gold/50 focus:outline-none"
                disabled={!conversationId || sending}
              />
              <Button
                type="button"
                size="icon"
                aria-label={t("chat.send")}
                onClick={send}
                disabled={!draft.trim() || !conversationId || sending}
                className="shrink-0 bg-gold text-[#0D0D0D] hover:bg-gold-dark"
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <Button
        type="button"
        onClick={openChat}
        variant="outline"
        className="w-full gap-2 border-gold/40 text-gold hover:bg-gold/10 hover:text-gold"
      >
        <MessageCircle className="h-4 w-4" /> {t("chat.direct")}
      </Button>
      {chatModal}
    </>
  );
}
