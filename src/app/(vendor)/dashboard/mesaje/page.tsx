"use client";

import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Send, User, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// M0b #12 — Artist dashboard: live conversations list backed by the
// persistent /api/conversations store (same source the client cabinet reads).

interface Conversation {
  id: number;
  artistId: number;
  clientUserId: string;
  clientName: string | null;
  clientEmail: string | null;
  lastMessageAt: string;
  lastMessagePreview: string | null;
  clientUnread: number;
  artistUnread: number;
  createdAt: string;
}

interface ChatMessage {
  id: number;
  senderType: string;
  senderName: string;
  message: string;
  createdAt: string;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("ro-RO", { day: "2-digit", month: "short" });
}

export default function VendorMessagesPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function loadList() {
    setLoading(true);
    try {
      const res = await fetch("/api/conversations?role=artist");
      const data = await res.json();
      const list: Conversation[] = Array.isArray(data) ? data : [];
      setConversations(list);
      if (list.length && selectedId == null) {
        setSelectedId(list[0].id);
      }
    } finally {
      setLoading(false);
    }
  }

  async function openConversation(id: number) {
    setSelectedId(id);
    const res = await fetch(`/api/conversations/${id}/messages`);
    const data = await res.json();
    setMessages(Array.isArray(data) ? data : []);
    // Server cleared artistUnread on GET; reflect it in the sidebar.
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, artistUnread: 0 } : c)),
    );
  }

  async function sendMessage() {
    const text = draft.trim();
    if (!text || !selectedId || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/conversations/${selectedId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      if (!res.ok) {
        toast.error("Nu s-a putut trimite mesajul");
        return;
      }
      const inserted = await res.json();
      setMessages((prev) => [...prev, inserted]);
      // Bump preview locally so the sidebar reflects the latest message.
      setConversations((prev) =>
        prev.map((c) =>
          c.id === selectedId
            ? {
                ...c,
                lastMessagePreview: text.length > 120 ? text.slice(0, 117) + "…" : text,
                lastMessageAt: new Date().toISOString(),
              }
            : c,
        ),
      );
      setDraft("");
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedId != null) openConversation(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const selected = conversations.find((c) => c.id === selectedId) || null;

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-bold">Mesaje</h1>

      <div className="grid h-[calc(100vh-14rem)] gap-4 lg:grid-cols-3">
        {/* Thread list */}
        <div className="space-y-2 overflow-y-auto">
          {loading ? (
            <div className="flex h-20 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-gold" />
            </div>
          ) : conversations.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nu ai conversații încă. Clienții îți vor apărea aici când deschid chat-ul pe profilul tău.
            </p>
          ) : (
            conversations.map((thread) => (
              <button
                key={thread.id}
                onClick={() => setSelectedId(thread.id)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-all",
                  selectedId === thread.id ? "border-gold bg-gold/5" : "border-border/40 hover:border-gold/30",
                )}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent">
                  <User className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium truncate">
                      {thread.clientName || thread.clientEmail || `Client #${thread.clientUserId.slice(0, 8)}`}
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {formatTime(thread.lastMessageAt)}
                    </span>
                  </div>
                  {thread.lastMessagePreview && (
                    <p className="mt-1 text-xs text-muted-foreground truncate">
                      {thread.lastMessagePreview}
                    </p>
                  )}
                </div>
                {thread.artistUnread > 0 && (
                  <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-gold px-1 text-[10px] font-bold text-background">
                    {thread.artistUnread}
                  </span>
                )}
              </button>
            ))
          )}
        </div>

        {/* Chat area */}
        <Card className="lg:col-span-2 flex flex-col">
          {selected ? (
            <>
              <div className="border-b border-border/40 px-4 py-3">
                <p className="font-medium">
                  {selected.clientName || selected.clientEmail || "Client"}
                </p>
                {selected.clientEmail && selected.clientName && (
                  <p className="text-xs text-muted-foreground">{selected.clientEmail}</p>
                )}
              </div>

              <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Niciun mesaj încă.
                  </p>
                ) : (
                  messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={cn("flex", msg.senderType === "artist" ? "justify-end" : "justify-start")}
                    >
                      <div
                        className={cn(
                          "max-w-[70%] rounded-xl px-4 py-2.5 text-sm",
                          msg.senderType === "artist" ? "bg-gold text-background" : "bg-accent",
                        )}
                      >
                        <p className="text-[10px] font-medium opacity-60 mb-1">{msg.senderName}</p>
                        <p className="whitespace-pre-wrap break-words">{msg.message}</p>
                        <p className="mt-1 text-[10px] opacity-60">
                          {new Date(msg.createdAt).toLocaleString("ro-RO")}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="border-t border-border/40 p-4 flex gap-2">
                <Input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Scrie un mesaj..."
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                  disabled={sending}
                />
                <Button
                  onClick={sendMessage}
                  disabled={sending || !draft.trim()}
                  className="bg-gold text-background hover:bg-gold-dark shrink-0"
                  size="icon"
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              Selectează o conversație.
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
