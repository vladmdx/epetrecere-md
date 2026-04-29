"use client";

import { useState, useEffect, useCallback } from "react";
import { useUser } from "@clerk/nextjs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import Link from "next/link";
import {
  Calendar,
  Loader2,
  Clock,
  Users,
  Music,
  ExternalLink,
  MessageSquare,
  HandCoins,
  CheckCircle2,
  Send,
  XCircle,
  Euro,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { BookingPriceOffer } from "@/components/planner/price-negotiation-panel";

interface BookingRequest {
  id: number;
  artistId: number;
  clientName: string;
  clientEmail: string | null;
  eventDate: string;
  startTime: string | null;
  endTime: string | null;
  eventType: string | null;
  guestCount: number | null;
  message: string | null;
  status: string;
  artistReply: string | null;
  artistName: string | null;
  artistSlug: string | null;
  agreedPrice: number | null;
  priceOffers: BookingPriceOffer[] | null;
  createdAt: string;
}

type ChatMessage = {
  id: number;
  bookingRequestId: number;
  senderType: "client" | "artist" | "admin";
  senderName: string;
  message: string;
  createdAt: string;
};

const statusConfig: Record<string, { label: string; color: string }> = {
  pending: { label: "În așteptare", color: "text-warning border-warning/30 bg-warning/5" },
  accepted: { label: "Acceptat de partener", color: "text-success border-success/30 bg-success/5" },
  confirmed_by_client: { label: "Confirmat", color: "text-success border-success/30 bg-success/5" },
  rejected: { label: "Refuzat", color: "text-destructive border-destructive/30 bg-destructive/5" },
  cancelled: { label: "Anulat", color: "text-muted-foreground border-border/40 bg-muted/5" },
  completed: { label: "Finalizat", color: "text-gold border-gold/30 bg-gold/5" },
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  wedding: "Nuntă",
  baptism: "Botez",
  cumatrie: "Cumătrie",
  corporate: "Corporate",
  birthday: "Aniversare",
  other: "Alt eveniment",
};

export default function ReservationsPage() {
  const { isSignedIn, user } = useUser();
  const [bookings, setBookings] = useState<BookingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"active" | "past">("active");
  const [busy, setBusy] = useState<number | null>(null);

  // Dialogs
  const [proposeDialog, setProposeDialog] = useState<BookingRequest | null>(null);
  const [proposeAmount, setProposeAmount] = useState("");
  const [proposeMessage, setProposeMessage] = useState("");
  const [messageDialog, setMessageDialog] = useState<BookingRequest | null>(null);
  const [messageText, setMessageText] = useState("");
  const [messageSending, setMessageSending] = useState(false);
  const [chats, setChats] = useState<Record<number, ChatMessage[]>>({});

  const refresh = useCallback(async () => {
    if (!isSignedIn || !user?.primaryEmailAddress?.emailAddress) return;
    const email = user.primaryEmailAddress.emailAddress;
    try {
      const r = await fetch(`/api/booking-requests?client_email=${encodeURIComponent(email)}`);
      if (r.ok) {
        const data = await r.json();
        if (Array.isArray(data)) setBookings(data);
      }
    } catch {
      // silent
    }
  }, [isSignedIn, user]);

  useEffect(() => {
    if (!isSignedIn || !user?.primaryEmailAddress?.emailAddress) return;
    refresh().finally(() => setLoading(false));
  }, [isSignedIn, user, refresh]);

  const activeStatuses = ["pending", "accepted", "confirmed_by_client"];
  const pastStatuses = ["rejected", "cancelled", "completed"];

  const activeBookings = bookings.filter(b => activeStatuses.includes(b.status));
  const pastBookings = bookings.filter(b => pastStatuses.includes(b.status));

  // Accept the partner's price offer
  async function acceptOffer(b: BookingRequest) {
    setBusy(b.id);
    try {
      const res = await fetch(`/api/booking-requests/${b.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "client_confirm" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Nu s-a putut confirma");
        return;
      }
      toast.success("Rezervare confirmată!");
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  async function cancelBooking(b: BookingRequest) {
    if (!confirm("Sigur vrei să anulezi această rezervare?")) return;
    setBusy(b.id);
    try {
      const res = await fetch(`/api/booking-requests/${b.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Nu s-a putut anula");
        return;
      }
      toast.success("Rezervare anulată");
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  async function confirmPropose() {
    if (!proposeDialog) return;
    const amt = Number(proposeAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("Introdu o sumă validă.");
      return;
    }
    setBusy(proposeDialog.id);
    try {
      const res = await fetch(`/api/booking-requests/${proposeDialog.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "propose_price",
          agreedPrice: amt,
          reply: proposeMessage.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Nu s-a putut trimite oferta");
        return;
      }
      toast.success("Ofertă trimisă partenerului");
      setProposeDialog(null);
      setProposeAmount("");
      setProposeMessage("");
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  async function openMessageDialog(b: BookingRequest) {
    setMessageDialog(b);
    setMessageText("");
    try {
      const r = await fetch(`/api/chat?booking_request_id=${b.id}`);
      if (r.ok) {
        const data = await r.json();
        setChats(prev => ({ ...prev, [b.id]: Array.isArray(data) ? data : [] }));
      }
    } catch {
      // silent
    }
  }

  // Real-time chat polling: while the message dialog is open, refresh the
  // thread every 4s so the partner's replies show up without page refresh.
  useEffect(() => {
    if (!messageDialog) return;
    const id = messageDialog.id;
    const tick = async () => {
      try {
        const r = await fetch(`/api/chat?booking_request_id=${id}`);
        if (!r.ok) return;
        const data = await r.json();
        if (Array.isArray(data)) {
          setChats(prev => ({ ...prev, [id]: data }));
        }
      } catch {
        // silent
      }
    };
    const handle = window.setInterval(tick, 4000);
    return () => window.clearInterval(handle);
  }, [messageDialog]);

  async function sendMessageFromDialog() {
    if (!messageDialog) return;
    const msg = messageText.trim();
    if (!msg) {
      toast.error("Scrie un mesaj înainte să trimiți.");
      return;
    }
    setMessageSending(true);
    try {
      const res = await fetch(`/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingRequestId: messageDialog.id,
          message: msg,
        }),
      });
      if (!res.ok) {
        toast.error("Nu s-a putut trimite mesajul");
        return;
      }
      toast.success("Mesaj trimis");
      setMessageText("");
      const r = await fetch(`/api/chat?booking_request_id=${messageDialog.id}`);
      if (r.ok) {
        const data = await r.json();
        setChats(prev => ({ ...prev, [messageDialog.id]: Array.isArray(data) ? data : [] }));
      }
    } catch {
      toast.error("Eroare la trimitere");
    } finally {
      setMessageSending(false);
    }
  }

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div>;
  }

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold mb-1">Rezervările Mele</h1>
      <p className="text-sm text-muted-foreground mb-6">{bookings.length} rezervări total</p>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "active" | "past")}>
        <TabsList>
          <TabsTrigger value="active" className="gap-1.5">
            Active
            {activeBookings.length > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-gold/20 px-1 text-[10px] font-bold text-gold">
                {activeBookings.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="past">Trecute ({pastBookings.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-4">
          {activeBookings.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Calendar className="mx-auto mb-3 h-8 w-8 opacity-40" />
              <p>Nu ai rezervări active.</p>
              <p className="text-xs mt-1">Explorează artiști și fă prima ta rezervare!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {activeBookings.map(b => renderBookingCard(b))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="past" className="mt-4">
          {pastBookings.length === 0 ? (
            <p className="py-12 text-center text-muted-foreground">Nu ai rezervări trecute.</p>
          ) : (
            <div className="space-y-3">
              {pastBookings.map(b => renderBookingCard(b))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Propose price dialog */}
      <Dialog open={!!proposeDialog} onOpenChange={(o) => !o && setProposeDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Propune un preț</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Preț (€) *</Label>
              <Input
                type="number"
                value={proposeAmount}
                onChange={(e) => setProposeAmount(e.target.value)}
                placeholder="ex: 200"
                autoFocus
              />
            </div>
            <div>
              <Label>Mesaj (opțional)</Label>
              <Textarea
                value={proposeMessage}
                onChange={(e) => setProposeMessage(e.target.value)}
                placeholder="Adaugă un mesaj pentru partener..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProposeDialog(null)}>Anulează</Button>
            <Button onClick={confirmPropose} disabled={busy === proposeDialog?.id} className="bg-gold text-[#0D0D0D] hover:bg-gold-dark">
              {busy === proposeDialog?.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Trimite oferta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Message dialog */}
      <Dialog open={!!messageDialog} onOpenChange={(o) => !o && setMessageDialog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Mesaj cu {messageDialog?.artistName ?? "partener"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {/* History */}
            <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border border-border/40 bg-background/50 p-3">
              {chats[messageDialog?.id ?? -1]?.length === 0 ? (
                <p className="text-center text-xs text-muted-foreground py-8">Niciun mesaj încă.</p>
              ) : (
                chats[messageDialog?.id ?? -1]?.map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      "rounded-lg px-3 py-2 text-sm",
                      m.senderType === "client"
                        ? "ml-8 bg-gold/15 text-foreground"
                        : "mr-8 bg-accent/40 text-foreground",
                    )}
                  >
                    <p className="text-[10px] font-semibold opacity-70">{m.senderName}</p>
                    <p className="whitespace-pre-wrap break-words">{m.message}</p>
                  </div>
                ))
              )}
            </div>
            <Textarea
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              placeholder="Scrie un mesaj..."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMessageDialog(null)}>Închide</Button>
            <Button onClick={sendMessageFromDialog} disabled={messageSending} className="bg-gold text-[#0D0D0D] hover:bg-gold-dark gap-1">
              {messageSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-4 w-4" /> Trimite</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );

  function renderBookingCard(b: BookingRequest) {
    const cfg = statusConfig[b.status] || statusConfig.pending;
    const eventLabel = b.eventType ? (EVENT_TYPE_LABELS[b.eventType] || b.eventType) : "Eveniment";

    const offers = b.priceOffers ?? [];
    const lastOffer = offers.length > 0 ? offers[offers.length - 1] : null;
    const lastOfferIsFromArtist = lastOffer?.from === "artist";
    const canNegotiate = b.status === "pending";
    const canConfirmAccepted = b.status === "accepted";

    return (
      <Card key={b.id} className="transition-all hover:border-gold/30">
        <CardContent className="py-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 space-y-2 min-w-0">
              {/* Header */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-heading font-semibold text-base">{eventLabel}</span>
                <Badge variant="outline" className={cn("text-xs", cfg.color)}>{cfg.label}</Badge>
                {b.agreedPrice !== null && b.agreedPrice > 0 && (
                  <Badge variant="outline" className="text-xs text-gold border-gold/30 bg-gold/5 gap-1">
                    <Euro className="h-3 w-3" /> {b.agreedPrice}€
                  </Badge>
                )}
              </div>

              {/* Artist info */}
              {b.artistName && (
                <div className="flex items-center gap-2 text-sm">
                  <Music className="h-3.5 w-3.5 text-gold" />
                  {b.artistSlug ? (
                    <Link href={`/artisti/${b.artistSlug}`} className="font-medium hover:text-gold flex items-center gap-1">
                      {b.artistName}
                      <ExternalLink className="h-3 w-3 opacity-50" />
                    </Link>
                  ) : (
                    <span className="font-medium">{b.artistName}</span>
                  )}
                </div>
              )}

              {/* Event details */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  {new Date(b.eventDate).toLocaleDateString("ro-MD", { day: "numeric", month: "long", year: "numeric" })}
                </span>
                {b.startTime && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {b.startTime}{b.endTime ? ` – ${b.endTime}` : ""}
                  </span>
                )}
                {b.guestCount && (
                  <span className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    {b.guestCount} invitați
                  </span>
                )}
              </div>

              {/* Initial message */}
              {b.message && (
                <div className="rounded-lg bg-accent/30 p-2.5 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Mesajul tău:</span> {b.message}
                </div>
              )}

              {/* Artist reply */}
              {b.artistReply && (
                <div className="rounded-lg bg-gold/5 border border-gold/10 p-2.5 text-xs">
                  <span className="font-medium text-gold">Răspunsul partenerului:</span>{" "}
                  <span className="text-foreground">{b.artistReply}</span>
                </div>
              )}

              {/* Price negotiation history */}
              {offers.length > 0 && (
                <div className="rounded-lg border border-gold/20 bg-gold/5 p-3 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-gold">
                    <HandCoins className="h-3.5 w-3.5" />
                    Istoric negociere preț
                  </div>
                  <div className="space-y-1.5">
                    {offers.map((offer, idx) => (
                      <div
                        key={idx}
                        className={cn(
                          "rounded-md px-2.5 py-1.5 text-xs flex items-start justify-between gap-2",
                          offer.from === "client"
                            ? "ml-6 bg-blue-500/10 border border-blue-500/20"
                            : "mr-6 bg-gold/10 border border-gold/20",
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 font-semibold">
                            <span className={offer.from === "client" ? "text-blue-400" : "text-gold"}>
                              {offer.from === "client" ? "Tu" : "Partenerul"}
                            </span>
                            <span className="text-base">{offer.amount}€</span>
                          </div>
                          {offer.message && (
                            <p className="mt-0.5 text-muted-foreground italic">&ldquo;{offer.message}&rdquo;</p>
                          )}
                        </div>
                        <span className="shrink-0 text-[10px] text-muted-foreground/60 whitespace-nowrap">
                          {new Date(offer.at).toLocaleDateString("ro-MD", { day: "numeric", month: "short" })}
                        </span>
                      </div>
                    ))}
                  </div>
                  {/* Hint when waiting on partner */}
                  {lastOffer && lastOffer.from === "client" && b.status === "pending" && (
                    <p className="text-[11px] text-muted-foreground italic">
                      ⏳ Așteptăm răspunsul partenerului la oferta ta.
                    </p>
                  )}
                </div>
              )}

              <p className="text-[10px] text-muted-foreground/60">
                Trimisă pe {new Date(b.createdAt).toLocaleDateString("ro-MD")}
              </p>
            </div>

            {/* Actions */}
            <div className="flex flex-col items-stretch gap-2 shrink-0 min-w-[140px]">
              {/* Accept partner's offer (when status = accepted) */}
              {canConfirmAccepted && (
                <Button
                  size="sm"
                  onClick={() => acceptOffer(b)}
                  disabled={busy === b.id}
                  className="gap-1 bg-green-600 hover:bg-green-700 text-white"
                >
                  {busy === b.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  )}
                  Confirmă
                </Button>
              )}

              {/* Counter-offer (when pending and partner sent a price) */}
              {canNegotiate && lastOfferIsFromArtist && (
                <Button
                  size="sm"
                  onClick={() => {
                    setProposeAmount(String(lastOffer?.amount ?? ""));
                    setProposeDialog(b);
                  }}
                  className="gap-1 bg-gold text-[#0D0D0D] hover:bg-gold-dark"
                >
                  <HandCoins className="h-3.5 w-3.5" />
                  Negociază
                </Button>
              )}

              {/* First counter-offer (no offers yet) */}
              {canNegotiate && offers.length === 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setProposeDialog(b)}
                  className="gap-1"
                >
                  <HandCoins className="h-3.5 w-3.5" />
                  Propune preț
                </Button>
              )}

              {/* Message */}
              <Button
                size="sm"
                variant="outline"
                onClick={() => openMessageDialog(b)}
                className="gap-1"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                Mesaj
              </Button>

              {/* Cancel (when pending or accepted) */}
              {(b.status === "pending" || b.status === "accepted") && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => cancelBooking(b)}
                  disabled={busy === b.id}
                  className="gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Anulează
                </Button>
              )}

              {b.artistSlug && (
                <Link href={`/artisti/${b.artistSlug}`}>
                  <Button variant="ghost" size="sm" className="gap-1 text-xs w-full">
                    <Music className="h-3.5 w-3.5" /> Profil
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }
}
