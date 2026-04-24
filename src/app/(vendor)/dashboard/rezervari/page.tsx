"use client";

import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar, User, Clock, Euro, CheckCircle, XCircle, Loader2, MessageSquare, Send, HandCoins, ArrowLeftRight, Star, Ban } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { toast } from "sonner";

import { type BookingPriceOffer } from "@/components/planner/price-negotiation-panel";

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
  status: "pending" | "accepted" | "confirmed_by_client" | "rejected" | "cancelled" | "completed";
  artistReply: string | null;
  agreedPrice: number | null;
  priceOffers: BookingPriceOffer[] | null;
  createdAt: string;
  linkedVenue: { id: number; nameRo: string; slug: string } | null;
};

type ChatMessage = {
  id: number;
  bookingRequestId: number;
  senderType: "client" | "artist" | "admin";
  senderName: string;
  message: string;
  createdAt: string;
};

const EVENT_TYPE_BORDER: Record<string, string> = {
  wedding: "border-l-red-500",
  nunta: "border-l-red-500",
  baptism: "border-l-blue-500",
  botez: "border-l-blue-500",
  cumatrie: "border-l-cyan-500",
  cumetrie: "border-l-cyan-500",
  corporate: "border-l-purple-500",
  birthday: "border-l-orange-500",
  aniversare: "border-l-orange-500",
};

/**
 * Hot/Warm/Cold lead score based on price, guest count, date proximity and
 * message completeness. Mirrors the venue-side scoring.
 */
function computeLeadScore(b: BookingRequest): {
  tier: "hot" | "warm" | "cold";
  label: string;
  emoji: string;
  className: string;
} {
  let score = 0;
  const price = b.agreedPrice ?? 0;
  if (price >= 3000) score += 3;
  else if (price >= 1500) score += 2;
  else if (price >= 500) score += 1;

  if (b.guestCount && b.guestCount >= 80) score += 2;
  else if (b.guestCount && b.guestCount >= 40) score += 1;

  if ((b.clientEmail) && b.clientPhone) score += 1;
  if (b.message && b.message.trim().length > 20) score += 1;

  if (b.eventDate) {
    const days = Math.floor(
      (new Date(b.eventDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    );
    if (days >= 0 && days <= 30) score += 2;
    else if (days > 30 && days <= 90) score += 1;
  }

  if (b.linkedVenue) score += 1;

  if (score >= 6) {
    return {
      tier: "hot",
      label: "Hot",
      emoji: "🔥",
      className: "bg-red-500/15 text-red-400 border-red-500/40",
    };
  }
  if (score >= 3) {
    return {
      tier: "warm",
      label: "Warm",
      emoji: "🌡️",
      className: "bg-yellow-500/15 text-yellow-400 border-yellow-500/40",
    };
  }
  return {
    tier: "cold",
    label: "Cold",
    emoji: "❄️",
    className: "bg-blue-500/15 text-blue-400 border-blue-500/40",
  };
}

const statusConfig: Record<string, { label: string; color: string }> = {
  pending: { label: "În așteptare", color: "bg-warning/10 text-warning border-warning/30" },
  accepted: { label: "Așteaptă confirmare client", color: "bg-amber-500/10 text-amber-500 border-amber-500/30" },
  confirmed_by_client: { label: "Confirmat ambele părți", color: "bg-success/10 text-success border-success/30" },
  rejected: { label: "Refuzat", color: "bg-destructive/10 text-destructive border-destructive/30" },
  cancelled: { label: "Anulat", color: "bg-muted text-muted-foreground border-border" },
  completed: { label: "Finalizat", color: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30" },
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

  // Pending-action dialogs (shown per booking).
  const [acceptDialog, setAcceptDialog] = useState<BookingRequest | null>(null);
  const [acceptReply, setAcceptReply] = useState("");
  const [rejectDialog, setRejectDialog] = useState<BookingRequest | null>(null);
  const [rejectReply, setRejectReply] = useState("");
  const [cancelDialog, setCancelDialog] = useState<BookingRequest | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [proposeDialog, setProposeDialog] = useState<BookingRequest | null>(
    null,
  );
  const [proposeAmount, setProposeAmount] = useState("");
  const [proposeMessage, setProposeMessage] = useState("");
  const [messageDialog, setMessageDialog] = useState<BookingRequest | null>(
    null,
  );
  const [messageText, setMessageText] = useState("");
  const [messageSending, setMessageSending] = useState(false);
  const [reviewRequested, setReviewRequested] = useState<Set<number>>(new Set());

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

  async function requestReview(bookingId: number) {
    setBusy(bookingId);
    try {
      const res = await fetch("/api/reviews/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingRequestId: bookingId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Nu s-a putut trimite invitația");
        return;
      }
      toast.success("Email trimis — clientul primește invitația pentru recenzie");
      setReviewRequested((prev) => new Set(prev).add(bookingId));
    } finally {
      setBusy(null);
    }
  }

  async function confirmVendorCancel() {
    if (!cancelDialog) return;
    setBusy(cancelDialog.id);
    try {
      const res = await fetch(`/api/booking-requests/${cancelDialog.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "vendor_cancel",
          reply: cancelReason.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Nu s-a putut anula");
        return;
      }
      toast.success("Rezervare anulată. Clientul a fost notificat.");
      setCancelDialog(null);
      setCancelReason("");
      await refreshBookings();
    } finally {
      setBusy(null);
    }
  }

  async function handleComplete(id: number) {
    setBusy(id);
    try {
      const res = await fetch(`/api/booking-requests/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete" }),
      });
      if (!res.ok) {
        toast.error("Nu s-a putut finaliza rezervarea");
        return;
      }
      toast.success("Rezervare marcată ca finalizată!");
      const r = await fetch(`/api/booking-requests?artist_id=${artistId}`);
      if (r.ok) setBookings(await r.json());
    } catch {
      toast.error("Eroare la finalizarea rezervării");
    } finally {
      setBusy(null);
    }
  }

  async function refreshBookings() {
    if (artistId == null) return;
    const r = await fetch(`/api/booking-requests?artist_id=${artistId}`);
    if (r.ok) setBookings(await r.json());
  }

  // Accept with the price the client already chose (no price input — the
  // artist is confirming the package the client picked).
  async function confirmAccept() {
    if (!acceptDialog) return;
    setBusy(acceptDialog.id);
    try {
      const res = await fetch(`/api/booking-requests/${acceptDialog.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "accept",
          reply: acceptReply.trim() || "Cererea a fost acceptată!",
        }),
      });
      if (!res.ok) {
        toast.error("Nu s-a putut accepta rezervarea");
        return;
      }
      toast.success("Rezervare acceptată!");
      setAcceptDialog(null);
      setAcceptReply("");
      await refreshBookings();
    } catch {
      toast.error("Eroare la acceptare");
    } finally {
      setBusy(null);
    }
  }

  async function confirmReject() {
    if (!rejectDialog) return;
    setBusy(rejectDialog.id);
    try {
      const res = await fetch(`/api/booking-requests/${rejectDialog.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reject",
          reply:
            rejectReply.trim() ||
            "Ne pare rău, nu sunt disponibil la data respectivă.",
        }),
      });
      if (!res.ok) {
        toast.error("Nu s-a putut respinge rezervarea");
        return;
      }
      toast.success("Rezervare respinsă");
      setRejectDialog(null);
      setRejectReply("");
      await refreshBookings();
    } catch {
      toast.error("Eroare la respingere");
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
        toast.error("Nu s-a putut trimite oferta");
        return;
      }
      toast.success("Ofertă trimisă clientului");
      setProposeDialog(null);
      setProposeAmount("");
      setProposeMessage("");
      await refreshBookings();
    } catch {
      toast.error("Eroare la trimitere");
    } finally {
      setBusy(null);
    }
  }

  // Open the message dialog AND eagerly load chat history so the artist
  // can see what's already been said with this specific client.
  async function openMessageDialog(b: BookingRequest) {
    setMessageDialog(b);
    setMessageText("");
    try {
      const r = await fetch(`/api/chat?booking_request_id=${b.id}`);
      if (r.ok) {
        const data = await r.json();
        setChats((prev) => ({
          ...prev,
          [b.id]: Array.isArray(data) ? data : [],
        }));
      }
    } catch {
      // silent
    }
  }

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
      // Refresh history in-place so the just-sent message appears instantly.
      const r = await fetch(
        `/api/chat?booking_request_id=${messageDialog.id}`,
      );
      if (r.ok) {
        const data = await r.json();
        setChats((prev) => ({
          ...prev,
          [messageDialog.id]: Array.isArray(data) ? data : [],
        }));
      }
    } catch {
      toast.error("Eroare la trimitere");
    } finally {
      setMessageSending(false);
    }
  }

  async function loadChat(bookingId: number) {
    try {
      const r = await fetch(`/api/chat?booking_request_id=${bookingId}`);
      if (!r.ok) return;
      const data = await r.json();
      setChats((prev) => ({ ...prev, [bookingId]: Array.isArray(data) ? data : [] }));
    } catch {
      // Silent — chat is secondary
    }
  }

  async function sendMessage(bookingId: number) {
    const msg = newMsg[bookingId]?.trim();
    if (!msg) return;
    try {
      const res = await fetch(`/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingRequestId: bookingId,
          message: msg,
        }),
      });
      if (!res.ok) {
        toast.error("Nu s-a putut trimite mesajul");
        return;
      }
      setNewMsg((prev) => ({ ...prev, [bookingId]: "" }));
      await loadChat(bookingId);
    } catch {
      toast.error("Eroare la trimiterea mesajului");
    }
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

  // Three buckets:
  //   active   — new pending cereri; the artist must act
  //   accepted — already accepted (awaiting client confirm or confirmed)
  //   past     — finished/cancelled/refused
  const activeStatuses = ["pending"];
  const acceptedStatuses = ["accepted", "confirmed_by_client"];
  const pastStatuses = ["rejected", "cancelled", "completed"];
  const activeBookings = bookings.filter((b) =>
    activeStatuses.includes(b.status),
  );
  const acceptedBookings = bookings.filter((b) =>
    acceptedStatuses.includes(b.status),
  );
  const pastBookings = bookings.filter((b) =>
    pastStatuses.includes(b.status),
  );

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
        <Tabs defaultValue="active">
          <TabsList>
            <TabsTrigger value="active" className="gap-1.5">
              Active
              {activeBookings.length > 0 && (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-gold/20 px-1 text-[10px] font-bold text-gold">
                  {activeBookings.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="accepted" className="gap-1.5">
              Acceptate
              {acceptedBookings.length > 0 && (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-500/20 px-1 text-[10px] font-bold text-emerald-400">
                  {acceptedBookings.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="past">
              Trecute ({pastBookings.length})
            </TabsTrigger>
          </TabsList>

          {(["active", "accepted", "past"] as const).map((tabKey) => {
            const list =
              tabKey === "active"
                ? activeBookings
                : tabKey === "accepted"
                  ? acceptedBookings
                  : pastBookings;
            const emptyMessage =
              tabKey === "active"
                ? "Nu aveți cereri noi de aprobat."
                : tabKey === "accepted"
                  ? "Nu aveți rezervări acceptate."
                  : "Nu aveți rezervări trecute.";
            return (
              <TabsContent key={tabKey} value={tabKey} className="mt-4">
                {list.length === 0 ? (
                  <Card>
                    <CardContent className="py-12 text-center text-muted-foreground">
                      {emptyMessage}
                    </CardContent>
                  </Card>
                ) : (
        <div className="space-y-3">
          {list.map((booking) => {
            const cfg = statusConfig[booking.status] || statusConfig.pending;
            const isExpanded = expandedId === booking.id;
            const chatMessages = chats[booking.id] || [];
            const eventKey = (booking.eventType || "other").toLowerCase();
            const borderColor = EVENT_TYPE_BORDER[eventKey] || "border-l-muted-foreground";
            const leadScore = computeLeadScore(booking);
            const showLeadScore =
              booking.status === "pending" ||
              booking.status === "accepted" ||
              booking.status === "confirmed_by_client";
            const reviewDone = reviewRequested.has(booking.id);
            return (
              <Card
                key={booking.id}
                className={cn("border-l-4 transition-all hover:border-gold/30", borderColor)}
              >
                <CardContent className="py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {showLeadScore && (
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold",
                              leadScore.className,
                            )}
                            title={`Lead Score: ${leadScore.label}`}
                          >
                            <span aria-hidden>{leadScore.emoji}</span>
                            {leadScore.label}
                          </span>
                        )}
                        <span className="font-heading font-bold">{booking.eventType || "Eveniment"}</span>
                        <Badge variant="outline" className={cn("text-xs", cfg.color)}>{cfg.label}</Badge>
                        {booking.agreedPrice != null && booking.agreedPrice > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-gold/15 px-2 py-0.5 text-xs font-bold text-gold">
                            <Euro className="h-3 w-3" />
                            {booking.agreedPrice}€
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> {formatDate(booking.eventDate)}</span>
                        {booking.startTime && booking.endTime && (
                          <span className="flex items-center gap-1 text-gold/90">
                            <Clock className="h-3.5 w-3.5" />
                            {booking.startTime}–{booking.endTime}
                          </span>
                        )}
                        <span className="flex items-center gap-1"><User className="h-3.5 w-3.5" /> {booking.clientName}</span>
                        {booking.guestCount != null && <span>{booking.guestCount} invitați</span>}
                      </div>
                      {booking.linkedVenue && (
                        <a
                          href={`/sali/${booking.linkedVenue.slug}`}
                          target="_blank"
                          rel="noopener"
                          className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-xs text-blue-300 hover:bg-blue-500/20"
                        >
                          📍 Eveniment la{" "}
                          <strong className="underline">
                            {booking.linkedVenue.nameRo}
                          </strong>
                        </a>
                      )}
                      {booking.message && (
                        <p className="text-sm text-muted-foreground italic">&ldquo;{booking.message}&rdquo;</p>
                      )}
                      {booking.artistReply && (
                        <p className="text-sm text-gold">↳ {booking.artistReply}</p>
                      )}
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Primită</p>
                        <p className="text-xs text-muted-foreground">{formatDate(booking.createdAt)}</p>
                      </div>
                      {booking.status === "completed" && (
                        <Button
                          size="sm"
                          onClick={() => requestReview(booking.id)}
                          disabled={busy === booking.id || reviewDone}
                          className="gap-1.5 bg-gold text-[#0D0D0D] hover:bg-gold-dark"
                        >
                          {busy === booking.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Star className="h-4 w-4" />
                          )}
                          {reviewDone ? "Invitație trimisă" : "Cere recenzie"}
                        </Button>
                      )}
                    </div>
                  </div>

                  {booking.status === "pending" && (
                    <div className="mt-4 space-y-2 border-t border-border/40 pt-3">
                      {/* Price history, if any prior counter-offers */}
                      {booking.priceOffers && booking.priceOffers.length > 0 && (
                        <div className="rounded-md border border-border/30 bg-background/40 p-2">
                          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                            Istoric oferte
                          </p>
                          <div className="space-y-1">
                            {booking.priceOffers.map((o, i) => (
                              <div
                                key={i}
                                className="flex items-center gap-2 text-xs"
                              >
                                <HandCoins
                                  className={cn(
                                    "h-3 w-3",
                                    o.from === "artist"
                                      ? "text-gold"
                                      : "text-muted-foreground",
                                  )}
                                />
                                <span className="text-muted-foreground">
                                  {o.from === "artist" ? "Tu" : "Client"}:
                                </span>
                                <span className="font-bold text-gold">
                                  {o.amount}€
                                </span>
                                {o.message && (
                                  <span className="text-muted-foreground italic">
                                    “{o.message}”
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Three actions in a single row */}
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          disabled={busy === booking.id}
                          onClick={() => {
                            setAcceptDialog(booking);
                            setAcceptReply("");
                          }}
                          className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
                        >
                          <CheckCircle className="h-3.5 w-3.5" />
                          Acceptă
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy === booking.id}
                          onClick={() => {
                            setProposeDialog(booking);
                            setProposeAmount(
                              booking.agreedPrice
                                ? String(booking.agreedPrice)
                                : "",
                            );
                            setProposeMessage("");
                          }}
                          className="gap-1.5"
                        >
                          <ArrowLeftRight className="h-3.5 w-3.5" />
                          Propune preț
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy === booking.id}
                          onClick={() => openMessageDialog(booking)}
                          className="gap-1.5 border-gold/40 text-gold hover:bg-gold/10"
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                          Trimite mesaj
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy === booking.id}
                          onClick={() => {
                            setRejectDialog(booking);
                            setRejectReply("");
                          }}
                          className="gap-1.5 border-destructive/50 text-destructive hover:bg-destructive/10"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Refuză
                        </Button>
                      </div>
                    </div>
                  )}

                  {(booking.status === "accepted" || booking.status === "confirmed_by_client") && (
                    <div className="mt-4 space-y-3 border-t border-border/40 pt-3">
                      <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => toggleExpand(booking.id)}
                        className="gap-1"
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                        {isExpanded ? "Ascunde chat" : `Chat (${chatMessages.length || "deschide"})`}
                      </Button>
                      <Button
                        size="sm"
                        disabled={busy === booking.id}
                        onClick={() => handleComplete(booking.id)}
                        className="gap-1 bg-emerald-600 text-white hover:bg-emerald-700"
                      >
                        <CheckCircle className="h-3.5 w-3.5" /> Finalizat
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy === booking.id}
                        onClick={() => {
                          setCancelDialog(booking);
                          setCancelReason("");
                        }}
                        className="gap-1 border-red-500/40 text-red-400 hover:bg-red-500/10"
                      >
                        <Ban className="h-3.5 w-3.5" /> Anulează
                      </Button>
                      </div>

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
              </TabsContent>
            );
          })}
        </Tabs>
      )}

      {/* ─── Accept confirmation dialog ─────────────────────────── */}
      <Dialog
        open={!!acceptDialog}
        onOpenChange={(v) => !v && setAcceptDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmă acceptarea</DialogTitle>
          </DialogHeader>
          {acceptDialog && (
            <div className="space-y-3 py-2">
              <div className="rounded-lg border border-border/40 bg-background/60 p-3 text-sm">
                <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
                  <span className="text-muted-foreground">Client:</span>
                  <span className="font-medium">{acceptDialog.clientName}</span>

                  <span className="text-muted-foreground">Eveniment:</span>
                  <span>{acceptDialog.eventType || "—"}</span>

                  <span className="text-muted-foreground">Data:</span>
                  <span>{formatDate(acceptDialog.eventDate)}</span>

                  {acceptDialog.startTime && acceptDialog.endTime && (
                    <>
                      <span className="text-muted-foreground">Interval:</span>
                      <span className="font-medium text-gold">
                        {acceptDialog.startTime}–{acceptDialog.endTime}
                      </span>
                    </>
                  )}

                  {acceptDialog.guestCount != null && (
                    <>
                      <span className="text-muted-foreground">Invitați:</span>
                      <span>{acceptDialog.guestCount}</span>
                    </>
                  )}

                  {acceptDialog.agreedPrice != null &&
                    acceptDialog.agreedPrice > 0 && (
                      <>
                        <span className="text-muted-foreground">Preț:</span>
                        <span className="font-heading text-base font-bold text-gold">
                          {acceptDialog.agreedPrice}€
                        </span>
                      </>
                    )}

                </div>
                {acceptDialog.message && (
                  <p className="mt-3 border-t border-border/30 pt-2 text-xs italic text-muted-foreground">
                    “{acceptDialog.message}”
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="accept-reply">Mesaj pentru client</Label>
                <Textarea
                  id="accept-reply"
                  value={acceptReply}
                  onChange={(e) => setAcceptReply(e.target.value)}
                  rows={3}
                  className="mt-1"
                  placeholder="Mulțumesc pentru rezervare! Accept cu plăcere."
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAcceptDialog(null)}
              disabled={busy === acceptDialog?.id}
            >
              Anulează
            </Button>
            <Button
              onClick={confirmAccept}
              disabled={busy === acceptDialog?.id}
              className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {busy === acceptDialog?.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle className="h-4 w-4" />
              )}
              Confirmă acceptarea
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Propose price dialog ──────────────────────────────── */}
      <Dialog
        open={!!proposeDialog}
        onOpenChange={(v) => !v && setProposeDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Propune un alt preț</DialogTitle>
          </DialogHeader>
          {proposeDialog && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg border border-border/40 bg-background/60 p-3 text-xs text-muted-foreground">
                Preț cerut de client:{" "}
                <span className="font-bold text-gold">
                  {proposeDialog.agreedPrice
                    ? `${proposeDialog.agreedPrice}€`
                    : "neprecizat"}
                </span>
                {proposeDialog.startTime && proposeDialog.endTime && (
                  <>
                    {" · "}Interval:{" "}
                    <span className="font-medium text-foreground">
                      {proposeDialog.startTime}–{proposeDialog.endTime}
                    </span>
                  </>
                )}
              </div>
              <div>
                <Label htmlFor="propose-amount">Sumă propusă (€)</Label>
                <Input
                  id="propose-amount"
                  type="number"
                  min="0"
                  value={proposeAmount}
                  onChange={(e) => setProposeAmount(e.target.value)}
                  className="mt-1"
                  placeholder="Ex: 250"
                />
              </div>
              <div>
                <Label htmlFor="propose-msg">Mesaj (opțional)</Label>
                <Textarea
                  id="propose-msg"
                  value={proposeMessage}
                  onChange={(e) => setProposeMessage(e.target.value)}
                  rows={2}
                  className="mt-1"
                  placeholder="Ex: Prețul include 2 ore + echipament."
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setProposeDialog(null)}
              disabled={busy === proposeDialog?.id}
            >
              Anulează
            </Button>
            <Button
              onClick={confirmPropose}
              disabled={busy === proposeDialog?.id || !proposeAmount}
              className="gap-1.5 bg-gold text-[#0D0D0D] hover:bg-gold-dark"
            >
              {busy === proposeDialog?.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowLeftRight className="h-4 w-4" />
              )}
              Trimite oferta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Message dialog (chat with the client) ─────────────── */}
      <Dialog
        open={!!messageDialog}
        onOpenChange={(v) => !v && setMessageDialog(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Mesaj către {messageDialog?.clientName ?? "client"}
            </DialogTitle>
          </DialogHeader>
          {messageDialog && (
            <div className="space-y-3 py-2">
              {/* Booking summary */}
              <div className="rounded-lg border border-border/40 bg-background/60 p-3 text-xs">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {formatDate(messageDialog.eventDate)}
                  </span>
                  {messageDialog.startTime && messageDialog.endTime && (
                    <span className="flex items-center gap-1 text-gold/90">
                      <Clock className="h-3 w-3" />
                      {messageDialog.startTime}–{messageDialog.endTime}
                    </span>
                  )}
                  {messageDialog.agreedPrice != null &&
                    messageDialog.agreedPrice > 0 && (
                      <span className="flex items-center gap-1 font-bold text-gold">
                        <Euro className="h-3 w-3" />
                        {messageDialog.agreedPrice}€
                      </span>
                    )}
                </div>
              </div>

              {/* Chat history */}
              <div className="max-h-64 space-y-1.5 overflow-y-auto rounded-lg border border-border/30 bg-background/30 p-2">
                {(chats[messageDialog.id] || []).length === 0 ? (
                  <p className="py-6 text-center text-xs text-muted-foreground">
                    Niciun mesaj încă. Scrie primul mesaj clientului.
                  </p>
                ) : (
                  (chats[messageDialog.id] || []).map((m) => (
                    <div
                      key={m.id}
                      className={cn(
                        "flex flex-col gap-0.5 rounded-lg p-2 text-sm",
                        m.senderType === "artist"
                          ? "ml-8 bg-gold/10 text-foreground"
                          : "mr-8 bg-accent/40 text-foreground",
                      )}
                    >
                      <span className="text-[10px] font-semibold opacity-80">
                        {m.senderName}
                        {" · "}
                        {new Date(m.createdAt).toLocaleString("ro-RO", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <span className="whitespace-pre-wrap break-words">
                        {m.message}
                      </span>
                    </div>
                  ))
                )}
              </div>

              {/* Composer */}
              <div>
                <Label htmlFor="msg-compose">Scrie un mesaj</Label>
                <Textarea
                  id="msg-compose"
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  rows={3}
                  className="mt-1"
                  placeholder="Ex: Bună! Aș putea afla mai multe despre eveniment…"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      sendMessageFromDialog();
                    }
                  }}
                />
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Apasă ⌘/Ctrl + Enter pentru a trimite
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setMessageDialog(null)}
              disabled={messageSending}
            >
              Închide
            </Button>
            <Button
              onClick={sendMessageFromDialog}
              disabled={messageSending || !messageText.trim()}
              className="gap-1.5 bg-gold text-[#0D0D0D] hover:bg-gold-dark"
            >
              {messageSending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Trimite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Vendor cancel dialog ───────────────────────────────── */}
      <Dialog
        open={!!cancelDialog}
        onOpenChange={(v) => !v && setCancelDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Anulează rezervare confirmată</DialogTitle>
          </DialogHeader>
          {cancelDialog && (
            <div className="space-y-3 py-2">
              <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-xs text-muted-foreground">
                Ziua <strong>{formatDate(cancelDialog.eventDate)}</strong> se va
                debloca în calendarul tău și clientul va fi notificat prin email.
                Folosește doar în caz de urgență (boală, forță majoră).
              </div>
              <div>
                <Label htmlFor="artist-cancel-reason">Motiv pentru client</Label>
                <Textarea
                  id="artist-cancel-reason"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  rows={3}
                  className="mt-1"
                  placeholder="Ne pare rău, am o urgență și nu pot ajunge..."
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCancelDialog(null)}
              disabled={busy === cancelDialog?.id}
            >
              Înapoi
            </Button>
            <Button
              onClick={confirmVendorCancel}
              disabled={busy === cancelDialog?.id}
              variant="outline"
              className="gap-1.5 border-red-500/40 text-red-400 hover:bg-red-500/10"
            >
              {busy === cancelDialog?.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Ban className="h-4 w-4" />
              )}
              Anulează rezervarea
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Reject confirmation dialog ────────────────────────── */}
      <Dialog
        open={!!rejectDialog}
        onOpenChange={(v) => !v && setRejectDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Refuză rezervarea</DialogTitle>
          </DialogHeader>
          {rejectDialog && (
            <div className="space-y-3 py-2">
              <p className="text-sm text-muted-foreground">
                Clientul{" "}
                <span className="font-medium text-foreground">
                  {rejectDialog.clientName}
                </span>{" "}
                va fi notificat că cererea a fost refuzată.
              </p>
              <div>
                <Label htmlFor="reject-reply">Motiv pentru client</Label>
                <Textarea
                  id="reject-reply"
                  value={rejectReply}
                  onChange={(e) => setRejectReply(e.target.value)}
                  rows={3}
                  className="mt-1"
                  placeholder="Ne pare rău, nu sunt disponibil la data respectivă."
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRejectDialog(null)}
              disabled={busy === rejectDialog?.id}
            >
              Anulează
            </Button>
            <Button
              onClick={confirmReject}
              disabled={busy === rejectDialog?.id}
              className="gap-1.5 bg-destructive text-white hover:bg-destructive/90"
            >
              {busy === rejectDialog?.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              Refuză rezervarea
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
