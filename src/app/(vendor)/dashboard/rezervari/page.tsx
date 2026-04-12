"use client";

import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, User, MapPin, CheckCircle, XCircle, Loader2, MessageSquare, Send } from "lucide-react";
import { cn } from "@/lib/utils";

type BookingRequest = {
  id: number;
  artistId: number;
  clientName: string;
  clientPhone: string;
  clientEmail: string | null;
  eventDate: string | null;
  startTime: string | null;
  endTime: string | null;
  eventType: string | null;
  guestCount: number | null;
  message: string | null;
  status: "pending" | "accepted" | "confirmed_by_client" | "rejected" | "cancelled";
  artistReply: string | null;
  createdAt: string;
};

type ChatMessage = {
  id: number;
  bookingRequestId: number;
  senderType: "client" | "artist" | "admin";
  senderName: string;
  message: string;
  createdAt: string;
};

const statusConfig: Record<string, { label: string; color: string }> = {
  pending: { label: "În așteptare", color: "bg-warning/10 text-warning border-warning/30" },
  accepted: { label: "Așteaptă confirmare client", color: "bg-amber-500/10 text-amber-500 border-amber-500/30" },
  confirmed_by_client: { label: "Confirmat ambele părți", color: "bg-success/10 text-success border-success/30" },
  rejected: { label: "Refuzat", color: "bg-destructive/10 text-destructive border-destructive/30" },
  cancelled: { label: "Anulat", color: "bg-muted text-muted-foreground border-border" },
};

function formatDate(d: string | null): string {
  if (!d) return "—";
  const dt = new Date(d.includes("T") ? d : d + "T00:00:00");
  return dt.toLocaleDateString("ro-RO", { day: "numeric", month: "long", year: "numeric" });
}

export default function VendorBookingsPage() {
  const { user, isLoaded } = useUser();
  const [loading, setLoading] = useState(true);
  const [artistId, setArtistId] = useState<number | null>(null);
  const [bookings, setBookings] = useState<BookingRequest[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [chats, setChats] = useState<Record<number, ChatMessage[]>>({});
  const [newMsg, setNewMsg] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);

  // Load artistId for the signed-in user
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!isLoaded) return;
    (async () => {
      try {
        const email = user?.primaryEmailAddress?.emailAddress;
        if (!email) {
          setError("Nu s-a putut determina contul de artist. Autentificați-vă din nou.");
          setLoading(false);
          return;
        }
        const r = await fetch(`/api/auth/check-role?email=${encodeURIComponent(email)}`);
        const data = await r.json();
        if (data.artistId) {
          setArtistId(data.artistId);
        } else {
          setError("Contul dvs. nu este asociat cu un profil de artist.");
          setLoading(false);
        }
      } catch {
        setError("Eroare la încărcarea profilului de artist. Încercați din nou.");
        setLoading(false);
      }
    })();
  }, [isLoaded, user]);

  // Load bookings for artist
  useEffect(() => {
    if (artistId == null) return;
    (async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/booking-requests?artist_id=${artistId}`);
        const data = await r.json();
        setBookings(Array.isArray(data) ? data : []);
      } finally {
        setLoading(false);
      }
    })();
  }, [artistId]);

  async function handleAction(id: number, action: "accept" | "reject") {
    const reply = action === "accept"
      ? "Mulțumesc pentru rezervare! Accept cu plăcere."
      : "Ne pare rău, nu sunt disponibil la data respectivă.";
    setBusy(id);
    try {
      await fetch(`/api/booking-requests/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reply }),
      });
      // Refresh
      const r = await fetch(`/api/booking-requests?artist_id=${artistId}`);
      setBookings(await r.json());
    } finally {
      setBusy(null);
    }
  }

  async function loadChat(bookingId: number) {
    const r = await fetch(`/api/chat?booking_request_id=${bookingId}`);
    const data = await r.json();
    setChats((prev) => ({ ...prev, [bookingId]: Array.isArray(data) ? data : [] }));
  }

  async function sendMessage(bookingId: number) {
    const msg = newMsg[bookingId]?.trim();
    if (!msg) return;
    await fetch(`/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bookingRequestId: bookingId,
        senderType: "artist",
        senderName: user?.fullName || "Artist",
        message: msg,
      }),
    });
    setNewMsg((prev) => ({ ...prev, [bookingId]: "" }));
    await loadChat(bookingId);
  }

  async function toggleExpand(id: number) {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (!chats[id]) await loadChat(id);
  }

  if (error) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Card>
          <CardContent className="py-12 text-center text-destructive">
            <XCircle className="mx-auto mb-3 h-8 w-8" />
            <p>{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Rezervări</h1>
        <p className="text-sm text-muted-foreground">
          {bookings.length} {bookings.length === 1 ? "rezervare" : "rezervări"}
        </p>
      </div>

      {bookings.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nu aveți încă nicio rezervare.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {bookings.map((booking) => {
            const cfg = statusConfig[booking.status] || statusConfig.pending;
            const isExpanded = expandedId === booking.id;
            const chatMessages = chats[booking.id] || [];
            return (
              <Card key={booking.id} className="transition-all hover:border-gold/30">
                <CardContent className="py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="font-heading font-bold">{booking.eventType || "Eveniment"}</span>
                        <Badge variant="outline" className={cn("text-xs", cfg.color)}>{cfg.label}</Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> {formatDate(booking.eventDate)}</span>
                        <span className="flex items-center gap-1"><User className="h-3.5 w-3.5" /> {booking.clientName}</span>
                        {booking.clientPhone && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {booking.clientPhone}</span>}
                        {booking.guestCount != null && <span>{booking.guestCount} invitați</span>}
                        {booking.startTime && booking.endTime && <span>{booking.startTime}–{booking.endTime}</span>}
                      </div>
                      {booking.message && (
                        <p className="text-sm text-muted-foreground italic">&ldquo;{booking.message}&rdquo;</p>
                      )}
                      {booking.artistReply && (
                        <p className="text-sm text-gold">↳ {booking.artistReply}</p>
                      )}
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="text-xs text-muted-foreground">Primită</p>
                      <p className="text-xs text-muted-foreground">{formatDate(booking.createdAt)}</p>
                    </div>
                  </div>

                  {booking.status === "pending" && (
                    <div className="mt-4 flex gap-2 border-t border-border/40 pt-3">
                      <Button
                        size="sm"
                        disabled={busy === booking.id}
                        onClick={() => handleAction(booking.id, "accept")}
                        className="gap-1 bg-success text-white hover:bg-success/90"
                      >
                        <CheckCircle className="h-3.5 w-3.5" /> Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy === booking.id}
                        onClick={() => handleAction(booking.id, "reject")}
                        className="gap-1 text-destructive"
                      >
                        <XCircle className="h-3.5 w-3.5" /> Refuză
                      </Button>
                    </div>
                  )}

                  {(booking.status === "accepted" || booking.status === "confirmed_by_client") && (
                    <div className="mt-4 space-y-3 border-t border-border/40 pt-3">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => toggleExpand(booking.id)}
                        className="gap-1"
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                        {isExpanded ? "Ascunde chat" : `Chat (${chatMessages.length || "deschide"})`}
                      </Button>

                      {isExpanded && (
                        <div className="space-y-2 rounded-lg border border-border/40 bg-background/50 p-3">
                          <div className="max-h-64 space-y-2 overflow-y-auto">
                            {chatMessages.length === 0 ? (
                              <p className="py-4 text-center text-xs text-muted-foreground">Niciun mesaj încă.</p>
                            ) : (
                              chatMessages.map((m) => (
                                <div
                                  key={m.id}
                                  className={cn(
                                    "flex flex-col gap-0.5 rounded-lg p-2 text-sm",
                                    m.senderType === "artist"
                                      ? "ml-8 bg-gold/10 text-foreground"
                                      : "mr-8 bg-accent/40 text-foreground",
                                  )}
                                >
                                  <span className="text-xs font-semibold opacity-80">
                                    {m.senderName} · {new Date(m.createdAt).toLocaleString("ro-RO")}
                                  </span>
                                  <span>{m.message}</span>
                                </div>
                              ))
                            )}
                          </div>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={newMsg[booking.id] || ""}
                              onChange={(e) => setNewMsg((p) => ({ ...p, [booking.id]: e.target.value }))}
                              placeholder="Scrie un mesaj..."
                              className="flex-1 rounded-md border border-border/40 bg-background px-3 py-1.5 text-sm"
                              onKeyDown={(e) => { if (e.key === "Enter") sendMessage(booking.id); }}
                            />
                            <Button size="sm" onClick={() => sendMessage(booking.id)} className="gap-1">
                              <Send className="h-3.5 w-3.5" /> Trimite
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
