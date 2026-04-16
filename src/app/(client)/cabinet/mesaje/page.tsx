"use client";

import { useState, useEffect, useRef } from "react";
import { useUser } from "@clerk/nextjs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Send, MessageCircle, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Conversation {
  id: number;
  artistId: number;
  artistName: string | null;
  artistSlug: string | null;
  lastMessageAt: string;
  lastMessagePreview: string | null;
  clientUnread: number;
}

interface ChatMessage {
  id: number;
  senderType: string;
  senderName: string;
  message: string;
  createdAt: string;
}

export default function MessagesPage() {
  const { isSignedIn } = useUser();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedConv, setSelectedConv] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isSignedIn) return;
    fetch("/api/conversations?role=client")
      .then(r => r.ok ? r.json() : [])
      .then(data => setConversations(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isSignedIn]);

  async function openConversation(id: number) {
    setSelectedConv(id);
    const res = await fetch(`/api/conversations/${id}/messages`);
    const data = await res.json();
    setMessages(Array.isArray(data) ? data : []);
    setConversations(prev => prev.map(c => c.id === id ? { ...c, clientUnread: 0 } : c));
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage() {
    if (!draft.trim() || !selectedConv) return;
    setSending(true);
    const res = await fetch(`/api/conversations/${selectedConv}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: draft.trim() }),
    });
    if (!res.ok) { toast.error("Eroare la trimitere."); setSending(false); return; }
    const msg = await res.json();
    setMessages(prev => [...prev, msg]);
    setDraft("");
    setSending(false);
  }

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div>;
  }

  if (selectedConv) {
    const conv = conversations.find(c => c.id === selectedConv);
    return (
      <div className="flex flex-col h-[calc(100vh-8rem)]">
        <div className="flex items-center gap-3 mb-4">
          <Button variant="ghost" size="icon" onClick={() => setSelectedConv(null)} className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h2 className="font-heading text-lg font-bold">{conv?.artistName || "Conversație"}</h2>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 rounded-xl border border-border/30 bg-accent/10 p-4">
          {messages.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-8">Niciun mesaj încă.</p>
          ) : messages.map(m => (
            <div key={m.id} className={cn("max-w-[75%] rounded-xl px-3 py-2 text-sm",
              m.senderType === "client" ? "ml-auto bg-gold/20 text-foreground" : "bg-accent/50 text-foreground"
            )}>
              <p className="text-[10px] font-medium text-muted-foreground mb-0.5">{m.senderName}</p>
              <p>{m.message}</p>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        <div className="flex gap-2 mt-3">
          <Input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="Scrie un mesaj..."
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage()}
          />
          <Button onClick={sendMessage} disabled={sending || !draft.trim()} className="bg-gold text-background hover:bg-gold-dark">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold mb-1">Mesaje</h1>
      <p className="text-sm text-muted-foreground mb-6">Conversațiile tale cu artiștii</p>

      {conversations.length === 0 ? (
        <p className="py-12 text-center text-muted-foreground">Nu ai conversații încă. Trimite un mesaj unui artist pentru a începe.</p>
      ) : (
        <div className="space-y-2">
          {conversations.map(c => (
            <Card key={c.id} className="cursor-pointer transition-all hover:border-gold/30" onClick={() => openConversation(c.id)}>
              <CardContent className="py-3">
                <div className="flex items-center gap-3">
                  {c.clientUnread > 0 && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-gold" />}
                  <div className={cn("flex-1 min-w-0", c.clientUnread === 0 && "ml-5")}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-sm">{c.artistName || "Artist"}</p>
                      {c.lastMessageAt && (
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {new Date(c.lastMessageAt).toLocaleDateString("ro-MD")}
                        </span>
                      )}
                    </div>
                    {c.lastMessagePreview && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{c.lastMessagePreview}</p>
                    )}
                  </div>
                  <MessageCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
