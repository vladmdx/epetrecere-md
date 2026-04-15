"use client";

import { useState, useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Link from "next/link";
import { Calendar, MessageSquare, Send, Loader2, CheckCircle2, MessageCircle, ClipboardList, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface BookingRequest {
  id: number;
  artistId: number;
  clientName: string;
  clientEmail: string | null;
  eventDate: string;
  startTime: string | null;
  endTime: string | null;
  eventType: string | null;
  status: string;
  artistReply: string | null;
  createdAt: string;
}

interface ChatMessage {
  id: number;
  senderType: string;
  senderName: string;
  message: string;
  createdAt: string;
}

interface Conversation {
  id: number;
  artistId: number;
  artistName: string | null;
  artistSlug: string | null;
  lastMessageAt: string;
  lastMessagePreview: string | null;
  clientUnread: number;
  artistUnread: number;
  createdAt: string;
}

const statusConfig: Record<string, { label: string; color: string }> = {
  pending: { label: "În așteptare artist", color: "text-warning border-warning/30" },
  accepted: { label: "Acceptat — confirmă", color: "text-success border-success/30" },
  confirmed_by_client: { label: "Confirmat ambele părți", color: "text-success border-success/30" },
  rejected: { label: "Refuzat", color: "text-destructive border-destructive/30" },
  cancelled: { label: "Anulat", color: "text-muted-foreground border-border/40" },
};

export default function ClientCabinetPage() {
  const { isSignedIn, user: clerkUser } = useUser();
  const [email, setEmail] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);
  const [bookings, setBookings] = useState<BookingRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<number | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [clientName, setClientName] = useState("");
  const [activeTab, setActiveTab] = useState<"bookings" | "chat" | "conversations">("bookings");
  // M0b #11 — persistent pre-booking conversations (one per artist, outlives
  // booking lifecycle).
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [convLoaded, setConvLoaded] = useState(false);
  const [selectedConv, setSelectedConv] = useState<number | null>(null);
  const [convMessages, setConvMessages] = useState<ChatMessage[]>([]);
  const [convDraft, setConvDraft] = useState("");

  // Auto-login if Clerk user is signed in
  useEffect(() => {
    if (isSignedIn && clerkUser?.primaryEmailAddress?.emailAddress) {
      const e = clerkUser.primaryEmailAddress.emailAddress;
      // Intentional sync-in-effect: we hydrate form fields from Clerk on
      // first sign-in detection, then kick off the fetch. The double
      // render is unavoidable — Clerk state arrives after the initial
      // render. The fetch-then-setState chain is the expected pattern
      // for data fetching in effects.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEmail(e);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setClientName(clerkUser.fullName || "");
      fetch(`/api/booking-requests?client_email=${encodeURIComponent(e)}`)
        .then(r => { if (!r.ok) throw new Error(); return r.json(); })
        .then(data => { if (Array.isArray(data)) setBookings(data); setLoggedIn(true); })
        .catch(() => { setLoggedIn(true); });
    }
  }, [isSignedIn, clerkUser]);

  async function handleLogin() {
    if (!email) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/booking-requests?client_email=${encodeURIComponent(email)}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setBookings(data);
      }
    } catch { /* empty */ }
    setLoggedIn(true);
    setLoading(false);
  }

  async function loadChat(bookingId: number) {
    setSelectedBooking(bookingId);
    setActiveTab("chat");
    const res = await fetch(`/api/chat?booking_request_id=${bookingId}`);
    const data = await res.json();
    setChatMessages(data);
  }

  async function sendMessage() {
    if (!newMessage || !selectedBooking) return;
    await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bookingRequestId: selectedBooking,
        senderType: "client",
        senderName: clientName || email,
        message: newMessage,
      }),
    });
    setNewMessage("");
    loadChat(selectedBooking);
    toast.success("Mesaj trimis!");
  }

  // Client confirms an "accepted" booking — completes the bilateral flow
  // (M0b #9) and moves the row into the "confirmed" bucket.
  async function confirmBooking(bookingId: number) {
    const res = await fetch(`/api/booking-requests/${bookingId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "client_confirm" }),
    });
    if (!res.ok) {
      toast.error("Nu am putut confirma rezervarea.");
      return;
    }
    toast.success("Rezervare confirmată! Artistul va primi notificare.");
    setBookings((prev) =>
      prev.map((b) =>
        b.id === bookingId ? { ...b, status: "confirmed_by_client" } : b,
      ),
    );
  }

  async function loadConversations() {
    const res = await fetch("/api/conversations?role=client");
    const data = await res.json();
    setConversations(Array.isArray(data) ? data : []);
    setConvLoaded(true);
  }

  async function openConversation(convId: number) {
    setSelectedConv(convId);
    const res = await fetch(`/api/conversations/${convId}/messages`);
    const data = await res.json();
    setConvMessages(Array.isArray(data) ? data : []);
    // Locally clear the client-side unread badge since the GET above reset it
    // on the server.
    setConversations((prev) =>
      prev.map((c) => (c.id === convId ? { ...c, clientUnread: 0 } : c)),
    );
  }

  async function sendConversationMessage() {
    const text = convDraft.trim();
    if (!text || !selectedConv) return;
    const res = await fetch(`/api/conversations/${selectedConv}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text }),
    });
    if (!res.ok) {
      toast.error("Nu am putut trimite mesajul.");
      return;
    }
    const inserted = await res.json();
    setConvMessages((prev) => [...prev, inserted]);
    setConvDraft("");
  }

  // Auto-load conversations the first time the user opens the tab.
  useEffect(() => {
    if (activeTab === "conversations" && !convLoaded && loggedIn) {
      // Intentional setState-via-fetch in effect: loadConversations
      // kicks off a fetch and sets state on resolve. This is the
      // canonical React data-fetching-in-effect pattern.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadConversations();
    }
  }, [activeTab, convLoaded, loggedIn]);

  if (!loggedIn) {
    return (
      <div className="mx-auto max-w-md py-20 px-4">
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-center">Cabinetul Meu</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">Introdu emailul folosit la rezervare pentru a vedea istoricul.</p>
            <div><Input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Numele tău" /></div>
            <div><Input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email folosit la rezervare" type="email" /></div>
            <Button onClick={handleLogin} disabled={loading} className="w-full bg-gold text-background hover:bg-gold-dark">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Intră în cabinet"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl py-8 px-4">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-heading text-2xl font-bold">Cabinetul Meu</h1>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/cabinet/planifica"
            className="inline-flex items-center gap-2 rounded-xl border border-gold/40 bg-gold/5 px-4 py-2 text-sm font-medium text-gold transition-colors hover:bg-gold/10"
          >
            <ClipboardList className="h-4 w-4" />
            Planificarea evenimentului
          </Link>
          <Link
            href="/cabinet/recenzii"
            className="inline-flex items-center gap-2 rounded-xl border border-gold/40 bg-gold/5 px-4 py-2 text-sm font-medium text-gold transition-colors hover:bg-gold/10"
          >
            <Star className="h-4 w-4" />
            Recenziile mele
          </Link>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "bookings" | "chat" | "conversations")}>
        <TabsList>
          <TabsTrigger value="bookings">Rezervările Mele ({bookings.length})</TabsTrigger>
          <TabsTrigger value="conversations" className="gap-1.5">
            <MessageCircle className="h-3.5 w-3.5" /> Conversații
            {conversations.reduce((sum, c) => sum + c.clientUnread, 0) > 0 && (
              <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-gold px-1 text-[10px] font-bold text-background">
                {conversations.reduce((sum, c) => sum + c.clientUnread, 0)}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="chat">Chat Rezervare</TabsTrigger>
        </TabsList>

        <TabsContent value="bookings" className="mt-6 space-y-3">
          {bookings.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">Nu ai rezervări încă.</p>
          ) : (
            bookings.map(b => {
              const cfg = statusConfig[b.status] || statusConfig.pending;
              return (
                <Card key={b.id} className="transition-all hover:border-gold/30">
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{b.eventType || "Eveniment"}</span>
                          <Badge variant="outline" className={cn("text-xs", cfg.color)}>{cfg.label}</Badge>
                        </div>
                        <div className="flex items-center gap-3 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> {b.eventDate}</span>
                          {b.startTime && <span>{b.startTime} - {b.endTime}</span>}
                        </div>
                        {b.artistReply && (
                          <div className="mt-2 rounded-lg bg-accent/50 p-3 text-sm">
                            <span className="font-medium">Răspunsul artistului:</span> {b.artistReply}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-stretch gap-2">
                        {b.status === "accepted" && (
                          <Button
                            size="sm"
                            className="gap-1 bg-gold text-background hover:bg-gold-dark"
                            onClick={() => confirmBooking(b.id)}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" /> Confirmă
                          </Button>
                        )}
                        {(b.status === "accepted" || b.status === "confirmed_by_client") && (
                          <Button variant="outline" size="sm" className="gap-1" onClick={() => loadChat(b.id)}>
                            <MessageSquare className="h-3.5 w-3.5" /> Chat
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        <TabsContent value="conversations" className="mt-6">
          <div className="grid gap-4 md:grid-cols-[280px_1fr]">
            <div className="space-y-2">
              {!convLoaded ? (
                <p className="text-sm text-muted-foreground py-4">Se încarcă...</p>
              ) : conversations.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">
                  Nu ai conversații încă. Deschide profilul unui artist și apasă &ldquo;Chat direct&rdquo;.
                </p>
              ) : (
                conversations.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => openConversation(c.id)}
                    className={cn(
                      "w-full rounded-lg border border-border/40 bg-card px-3 py-2.5 text-left transition-colors hover:border-gold/40",
                      selectedConv === c.id && "border-gold/60 bg-gold/5",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium text-sm">
                        {c.artistName || `Artist #${c.artistId}`}
                      </span>
                      {c.clientUnread > 0 && (
                        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-gold px-1.5 text-[10px] font-bold text-background">
                          {c.clientUnread}
                        </span>
                      )}
                    </div>
                    {c.lastMessagePreview && (
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {c.lastMessagePreview}
                      </p>
                    )}
                    <p className="mt-1 text-[10px] text-muted-foreground/70">
                      {new Date(c.lastMessageAt).toLocaleString("ro-RO")}
                    </p>
                  </button>
                ))
              )}
            </div>

            {selectedConv ? (
              <Card className="flex flex-col h-[500px]">
                <CardHeader className="border-b border-border/40 py-3">
                  <CardTitle className="text-base">
                    {conversations.find((c) => c.id === selectedConv)?.artistName || "Conversație"}
                  </CardTitle>
                </CardHeader>
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {convMessages.length === 0 ? (
                    <p className="text-center text-sm text-muted-foreground py-8">
                      Începe conversația.
                    </p>
                  ) : (
                    convMessages.map((m) => (
                      <div key={m.id} className={cn("flex", m.senderType === "client" ? "justify-end" : "justify-start")}>
                        <div
                          className={cn(
                            "max-w-[70%] rounded-xl px-4 py-2.5 text-sm",
                            m.senderType === "client" ? "bg-gold text-background" : "bg-accent",
                          )}
                        >
                          <p className="text-[10px] font-medium opacity-60 mb-1">{m.senderName}</p>
                          <p className="whitespace-pre-wrap break-words">{m.message}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="border-t border-border/40 p-4 flex gap-2">
                  <Input
                    value={convDraft}
                    onChange={(e) => setConvDraft(e.target.value)}
                    placeholder="Scrie un mesaj..."
                    onKeyDown={(e) => e.key === "Enter" && sendConversationMessage()}
                  />
                  <Button
                    onClick={sendConversationMessage}
                    className="bg-gold text-background hover:bg-gold-dark shrink-0"
                    size="icon"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            ) : (
              <div className="flex h-[500px] items-center justify-center rounded-lg border border-dashed border-border/40 text-center text-sm text-muted-foreground">
                Selectează o conversație din stânga.
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="chat" className="mt-6">
          {selectedBooking ? (
            <Card className="flex flex-col h-[500px]">
              <CardHeader className="border-b border-border/40 py-3">
                <CardTitle className="text-base">Chat — Rezervare #{selectedBooking}</CardTitle>
              </CardHeader>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {chatMessages.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground py-8">Începe conversația cu artistul.</p>
                )}
                {chatMessages.map(msg => (
                  <div key={msg.id} className={cn("flex", msg.senderType === "client" ? "justify-end" : "justify-start")}>
                    <div className={cn("max-w-[70%] rounded-xl px-4 py-2.5 text-sm", msg.senderType === "client" ? "bg-gold text-background" : "bg-accent")}>
                      <p className="text-[10px] font-medium opacity-60 mb-1">{msg.senderName}</p>
                      <p>{msg.message}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t border-border/40 p-4 flex gap-2">
                <Input value={newMessage} onChange={e => setNewMessage(e.target.value)} placeholder="Scrie un mesaj..." onKeyDown={e => e.key === "Enter" && sendMessage()} />
                <Button onClick={sendMessage} className="bg-gold text-background hover:bg-gold-dark shrink-0" size="icon"><Send className="h-4 w-4" /></Button>
              </div>
            </Card>
          ) : (
            <p className="text-center text-muted-foreground py-8">Selectează o rezervare acceptată pentru a deschide chat-ul.</p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
