"use client";

import { useState, useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar, MessageSquare, Clock, CheckCircle, XCircle, Send, Loader2 } from "lucide-react";
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

const statusConfig: Record<string, { label: string; color: string }> = {
  pending: { label: "În așteptare", color: "text-warning border-warning/30" },
  accepted: { label: "Acceptat", color: "text-success border-success/30" },
  rejected: { label: "Refuzat", color: "text-destructive border-destructive/30" },
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

  // Auto-login if Clerk user is signed in
  useEffect(() => {
    if (isSignedIn && clerkUser?.primaryEmailAddress?.emailAddress) {
      const e = clerkUser.primaryEmailAddress.emailAddress;
      setEmail(e);
      setClientName(clerkUser.fullName || "");
      fetch(`/api/booking-requests?client_email=${encodeURIComponent(e)}`)
        .then(r => r.json())
        .then(data => { setBookings(data); setLoggedIn(true); })
        .catch(() => {});
    }
  }, [isSignedIn, clerkUser]);

  async function handleLogin() {
    if (!email) return;
    setLoading(true);
    const res = await fetch(`/api/booking-requests?client_email=${encodeURIComponent(email)}`);
    const data = await res.json();
    setBookings(data);
    setLoggedIn(true);
    setLoading(false);
  }

  async function loadChat(bookingId: number) {
    setSelectedBooking(bookingId);
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
      <h1 className="font-heading text-2xl font-bold mb-6">Cabinetul Meu</h1>

      <Tabs defaultValue="bookings">
        <TabsList>
          <TabsTrigger value="bookings">Rezervările Mele ({bookings.length})</TabsTrigger>
          <TabsTrigger value="chat">Chat</TabsTrigger>
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
                      {b.status === "accepted" && (
                        <Button variant="outline" size="sm" className="gap-1" onClick={() => loadChat(b.id)}>
                          <MessageSquare className="h-3.5 w-3.5" /> Chat
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
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
