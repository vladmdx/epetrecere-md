"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
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
import { useLocale } from "@/hooks/use-locale";
import { normalizeEventType, eventTypeLabel } from "@/lib/events/normalize";
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
  cununie: "border-l-rose-500",
  baptism: "border-l-blue-500",
  botez: "border-l-blue-500",
  cumatrie: "border-l-cyan-500",
  cumetrie: "border-l-cyan-500",
  corporate: "border-l-purple-500",
  birthday: "border-l-orange-500",
  aniversare: "border-l-orange-500",
  kids_birthday: "border-l-amber-500",
};

/**
 * Hot/Warm/Cold lead score based on price, guest count, date proximity and
 * message completeness. Mirrors the venue-side scoring.
 */
function computeLeadScore(b: BookingRequest): {
  tier: "hot" | "warm" | "cold";
  labelKey: string;
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
      labelKey: "vendor.bookingsPage.leadTier.hot",
      emoji: "🔥",
      className: "bg-red-500/15 text-red-400 border-red-500/40",
    };
  }
  if (score >= 3) {
    return {
      tier: "warm",
      labelKey: "vendor.bookingsPage.leadTier.warm",
      emoji: "🌡️",
      className: "bg-yellow-500/15 text-yellow-400 border-yellow-500/40",
    };
  }
  return {
    tier: "cold",
    labelKey: "vendor.bookingsPage.leadTier.cold",
    emoji: "❄️",
    className: "bg-blue-500/15 text-blue-400 border-blue-500/40",
  };
}

const statusConfig: Record<string, { labelKey: string; color: string }> = {
  pending: { labelKey: "vendor.bookingsPage.status.pending", color: "bg-warning/10 text-warning border-warning/30" },
  accepted: { labelKey: "vendor.bookingsPage.status.accepted", color: "bg-amber-500/10 text-amber-500 border-amber-500/30" },
  confirmed_by_client: { labelKey: "vendor.bookingsPage.status.confirmedByClient", color: "bg-success/10 text-success border-success/30" },
  rejected: { labelKey: "vendor.bookingsPage.status.rejected", color: "bg-destructive/10 text-destructive border-destructive/30" },
  cancelled: { labelKey: "vendor.bookingsPage.status.cancelled", color: "bg-muted text-muted-foreground border-border" },
  completed: { labelKey: "vendor.bookingsPage.status.completed", color: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30" },
};

function formatDate(d: string | null): string {
  if (!d) return "—";
  const dt = new Date(d.includes("T") ? d : d + "T00:00:00");
  return dt.toLocaleDateString("ro-RO", { day: "numeric", month: "long", year: "numeric" });
}

export default function VendorBookingsPage() {
  const { user, isLoaded } = useUser();
  const { t } = useLocale();
  // Deep-link support: the partner dashboard sends users here with
  // ?expand=<bookingId> when they click "Deschide cererea" or a row in
  // the recent-requests list. We pre-open that booking on mount and
  // scroll it into view so the partner lands on the right entry.
  const searchParams = useSearchParams();
  const expandParam = searchParams.get("expand");
  const expandId = expandParam ? Number(expandParam) : null;
  const [loading, setLoading] = useState(true);
  const [artistId, setArtistId] = useState<number | null>(null);
  const [bookings, setBookings] = useState<BookingRequest[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(
    Number.isFinite(expandId) ? expandId : null,
  );
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
          setError(t("vendor.bookingsPage.errorNoArtistAccount"));
          setLoading(false);
          return;
        }
        const r = await fetch(`/api/auth/check-role?email=${encodeURIComponent(email)}`);
        const data = await r.json();
        if (data.artistId) {
          setArtistId(data.artistId);
        } else {
          setError(t("vendor.bookingsPage.errorNotArtist"));
          setLoading(false);
        }
      } catch {
        setError(t("vendor.bookingsPage.errorLoadProfile"));
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

  // Once bookings have rendered, scroll the deep-linked one into view.
  // Wrapped in a small timeout so the layout has time to mount the card.
  useEffect(() => {
    if (!expandId || loading || bookings.length === 0) return;
    const t = setTimeout(() => {
      const el = document.getElementById(`booking-${expandId}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 200);
    return () => clearTimeout(t);
  }, [expandId, loading, bookings.length]);

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
        toast.error(err.error || t("vendor.bookingsPage.toastReviewInviteError"));
        return;
      }
      toast.success(t("vendor.bookingsPage.toastReviewInviteSent"));
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
        toast.error(err.error || t("vendor.bookingsPage.toastCancelError"));
        return;
      }
      toast.success(t("vendor.bookingsPage.toastCancelled"));
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
        toast.error(t("vendor.bookingsPage.toastCompleteError"));
        return;
      }
      toast.success(t("vendor.bookingsPage.toastCompleted"));
      const r = await fetch(`/api/booking-requests?artist_id=${artistId}`);
      if (r.ok) setBookings(await r.json());
    } catch {
      toast.error(t("vendor.bookingsPage.toastCompleteFailed"));
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
          reply: acceptReply.trim() || t("vendor.bookingsPage.defaultAcceptReply"),
        }),
      });
      if (!res.ok) {
        toast.error(t("vendor.bookingsPage.toastAcceptError"));
        return;
      }
      toast.success(t("vendor.bookingsPage.toastAccepted"));
      setAcceptDialog(null);
      setAcceptReply("");
      await refreshBookings();
    } catch {
      toast.error(t("vendor.bookingsPage.toastAcceptFailed"));
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
            rejectReply.trim() || t("vendor.bookingsPage.defaultRejectReply"),
        }),
      });
      if (!res.ok) {
        toast.error(t("vendor.bookingsPage.toastRejectError"));
        return;
      }
      toast.success(t("vendor.bookingsPage.toastRejected"));
      setRejectDialog(null);
      setRejectReply("");
      await refreshBookings();
    } catch {
      toast.error(t("vendor.bookingsPage.toastRejectFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function confirmPropose() {
    if (!proposeDialog) return;
    const amt = Number(proposeAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error(t("vendor.bookingsPage.toastInvalidAmount"));
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
        toast.error(t("vendor.bookingsPage.toastOfferError"));
        return;
      }
      toast.success(t("vendor.bookingsPage.toastOfferSent"));
      setProposeDialog(null);
      setProposeAmount("");
      setProposeMessage("");
      await refreshBookings();
    } catch {
      toast.error(t("booking.card.sendError"));
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

  // Poll the chat thread every 4s while the dialog is open so the artist sees
  // the client's reply without refreshing the page.
  useEffect(() => {
    if (!messageDialog) return;
    const id = messageDialog.id;
    const tick = async () => {
      try {
        const r = await fetch(`/api/chat?booking_request_id=${id}`);
        if (!r.ok) return;
        const data = await r.json();
        if (Array.isArray(data)) {
          setChats((prev) => ({ ...prev, [id]: data }));
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
      toast.error(t("vendor.bookingsPage.toastEmptyMessage"));
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
        toast.error(t("vendor.bookingsPage.toastMessageError"));
        return;
      }
      toast.success(t("vendor.bookingsPage.toastMessageSent"));
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
      toast.error(t("booking.card.sendError"));
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
        toast.error(t("vendor.bookingsPage.toastMessageError"));
        return;
      }
      setNewMsg((prev) => ({ ...prev, [bookingId]: "" }));
      await loadChat(bookingId);
    } catch {
      toast.error(t("vendor.bookingsPage.toastMessageFailed"));
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
        <h1 className="font-heading text-2xl font-bold">{t("vendor.bookings")}</h1>
        <p className="text-sm text-muted-foreground">
          {t(bookings.length === 1 ? "vendor.bookingsPage.countOne" : "vendor.bookingsPage.countMany", { count: bookings.length })}
        </p>
      </div>

      {bookings.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {t("vendor.bookingsPage.emptyAll")}
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="active">
          <TabsList>
            <TabsTrigger value="active" className="gap-1.5">
              {t("vendor.bookingsPage.tabActive")}
              {activeBookings.length > 0 && (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-gold/20 px-1 text-[10px] font-bold text-gold">
                  {activeBookings.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="accepted" className="gap-1.5">
              {t("vendor.bookingsPage.tabAccepted")}
              {acceptedBookings.length > 0 && (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-500/20 px-1 text-[10px] font-bold text-emerald-400">
                  {acceptedBookings.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="past">
              {t("vendor.bookingsPage.tabPast", { count: pastBookings.length })}
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
                ? t("vendor.bookingsPage.emptyActive")
                : tabKey === "accepted"
                  ? t("vendor.bookingsPage.emptyAccepted")
                  : t("vendor.bookingsPage.emptyPast");
            return (
              <TabsContent key={tabKey} value={tabKey} className="mt-4">
                {list.length === 0 ? (
                  <Card>
                    <CardContent className="py-12 text-center text-muted-foreground">
                      {emptyMessage}
                    </CardContent>
                  </Card>
                ) : (
        <div className="space-y-6">
          {(() => {
            // Group bookings by event date so the partner sees their
            // calendar at a glance instead of a flat 30-row list. Each
            // group shows a sticky-feeling header with the event date
            // and the count of requests for that day. Within a group
            // we sort by created_at desc so newest activity bubbles up.
            const groups = new Map<string, typeof list>();
            for (const b of list) {
              const key = b.eventDate ?? "fără-dată";
              const arr = groups.get(key);
              if (arr) arr.push(b);
              else groups.set(key, [b] as typeof list);
            }
            const sortedKeys = Array.from(groups.keys()).sort((a, b) => {
              if (a === "fără-dată") return 1;
              if (b === "fără-dată") return -1;
              return a.localeCompare(b);
            });
            return sortedKeys.map((dateKey) => {
              const dateBookings = groups.get(dateKey) ?? [];
              const headerLabel =
                dateKey === "fără-dată"
                  ? t("vendor.bookingsPage.noDateSet")
                  : new Date(dateKey + "T00:00:00").toLocaleDateString("ro-MD", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    });
              return (
                <div key={dateKey} className="space-y-3">
                  <div className="flex items-end justify-between gap-3 border-b border-border/30 pb-1.5">
                    <h3 className="font-heading text-sm font-bold text-gold">
                      {headerLabel}
                    </h3>
                    <span className="text-xs text-muted-foreground">
                      {t(dateBookings.length === 1 ? "vendor.bookingsPage.requestCountOne" : "vendor.bookingsPage.requestCountMany", { count: dateBookings.length })}
                    </span>
                  </div>
                  {dateBookings.map((booking) => {
            const cfg = statusConfig[booking.status] || statusConfig.pending;
            const isExpanded = expandedId === booking.id;
            const chatMessages = chats[booking.id] || [];
            const eventKey = (booking.eventType || "other").toLowerCase();
            const borderColor = EVENT_TYPE_BORDER[eventKey] || "border-l-muted-foreground";
            const eventTypeKey = normalizeEventType(booking.eventType);
            const leadScore = computeLeadScore(booking);
            const showLeadScore =
              booking.status === "pending" ||
              booking.status === "accepted" ||
              booking.status === "confirmed_by_client";
            const reviewDone = reviewRequested.has(booking.id);
            return (
              <Card
                key={booking.id}
                id={`booking-${booking.id}`}
                className={cn(
                  "border-l-4 transition-all hover:border-gold/30",
                  borderColor,
                  isExpanded && booking.id === expandId
                    ? "ring-2 ring-gold/40"
                    : "",
                )}
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
                            title={t("vendor.bookingsPage.leadScoreTitle", { label: t(leadScore.labelKey) })}
                          >
                            <span aria-hidden>{leadScore.emoji}</span>
                            {t(leadScore.labelKey)}
                          </span>
                        )}
                        <span className="font-heading font-bold">
                          {eventTypeKey ? eventTypeLabel(eventTypeKey) : t("vendor.bookingsPage.eventFallback")}
                        </span>
                        {(() => {
                          const offers = booking.priceOffers ?? [];
                          const lastOffer = offers.length > 0 ? offers[offers.length - 1] : null;
                          const waitingForClient = booking.status === "pending" && lastOffer?.from === "artist";
                          const clientCounter = booking.status === "pending" && lastOffer?.from === "client";
                          if (waitingForClient) {
                            return (
                              <Badge variant="outline" className="text-xs text-amber-500 border-amber-500/40 bg-amber-500/10">
                                {t("vendor.bookingsPage.waitingClientBadge")}
                              </Badge>
                            );
                          }
                          if (clientCounter) {
                            return (
                              <Badge variant="outline" className="text-xs text-blue-400 border-blue-500/40 bg-blue-500/10">
                                {t("vendor.bookingsPage.clientCounterBadge")}
                              </Badge>
                            );
                          }
                          return <Badge variant="outline" className={cn("text-xs", cfg.color)}>{t(cfg.labelKey)}</Badge>;
                        })()}
                        {(() => {
                          const offers = booking.priceOffers ?? [];
                          const lastOffer = offers.length > 0 ? offers[offers.length - 1] : null;
                          const displayPrice = lastOffer?.amount ?? booking.agreedPrice;
                          if (displayPrice == null || displayPrice <= 0) return null;
                          return (
                            <span className="inline-flex items-center gap-1 rounded-full bg-gold/15 px-2 py-0.5 text-xs font-bold text-gold">
                              <Euro className="h-3 w-3" />
                              {displayPrice}€
                              {lastOffer && (
                                <span className="opacity-70 font-normal">
                                  ({lastOffer.from === "artist" ? t("vendor.bookingsPage.youLower") : t("vendor.bookingsPage.clientLower")})
                                </span>
                              )}
                            </span>
                          );
                        })()}
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
                        {booking.guestCount != null && <span>{booking.guestCount} {t("common.guests")}</span>}
                      </div>
                      {booking.linkedVenue && (
                        <a
                          href={`/sali/${booking.linkedVenue.slug}`}
                          target="_blank"
                          rel="noopener"
                          className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-xs text-blue-300 hover:bg-blue-500/20"
                        >
                          {t("vendor.bookingsPage.eventAt")}{" "}
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
                        <p className="text-xs text-muted-foreground">{t("vendor.bookingsPage.receivedLabel")}</p>
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
                          {reviewDone ? t("vendor.bookingsPage.reviewSent") : t("vendor.bookingsPage.requestReview")}
                        </Button>
                      )}
                    </div>
                  </div>

                  {booking.status === "pending" && (() => {
                    const offers = booking.priceOffers ?? [];
                    const lastOffer = offers.length > 0 ? offers[offers.length - 1] : null;
                    // Partner already counter-offered — wait for client response.
                    // Hide Accept/Propose/Reject; keep only "Trimite mesaj".
                    const waitingForClient = lastOffer?.from === "artist";
                    return (
                      <div className="mt-4 space-y-2 border-t border-border/40 pt-3">
                        {/* Price history */}
                        {offers.length > 0 && (
                          <div className="rounded-md border border-border/30 bg-background/40 p-2">
                            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                              {t("vendor.bookingsPage.offerHistory")}
                            </p>
                            <div className="space-y-1">
                              {offers.map((o, i) => (
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
                                    {o.from === "artist" ? t("vendor.bookingsPage.you") : t("vendor.bookingsPage.client")}:
                                  </span>
                                  <span className="font-bold text-gold">
                                    {o.amount}€
                                  </span>
                                  {o.message && (
                                    <span className="text-muted-foreground italic">
                                      &ldquo;{o.message}&rdquo;
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {waitingForClient ? (
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs text-amber-500 italic">
                              {t("vendor.bookingsPage.waitingClientHint", { amount: lastOffer?.amount ?? "" })}
                            </p>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy === booking.id}
                              onClick={() => openMessageDialog(booking)}
                              className="gap-1.5 border-gold/40 text-gold hover:bg-gold/10"
                            >
                              <MessageSquare className="h-3.5 w-3.5" />
                              {t("vendor.bookingsPage.sendMessage")}
                            </Button>
                          </div>
                        ) : (
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
                              {lastOffer?.from === "client" ? t("vendor.bookingsPage.acceptAmount", { amount: lastOffer.amount }) : t("vendor.bookingsPage.accept")}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy === booking.id}
                              onClick={() => {
                                setProposeDialog(booking);
                                setProposeAmount(
                                  String(lastOffer?.amount ?? booking.agreedPrice ?? ""),
                                );
                                setProposeMessage("");
                              }}
                              className="gap-1.5"
                            >
                              <ArrowLeftRight className="h-3.5 w-3.5" />
                              {t("vendor.bookingsPage.proposePrice")}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy === booking.id}
                              onClick={() => openMessageDialog(booking)}
                              className="gap-1.5 border-gold/40 text-gold hover:bg-gold/10"
                            >
                              <MessageSquare className="h-3.5 w-3.5" />
                              {t("vendor.bookingsPage.sendMessage")}
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
                              {t("vendor.bookingsPage.reject")}
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })()}

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
                        {isExpanded
                          ? t("vendor.bookingsPage.hideChat")
                          : t("vendor.bookingsPage.chatCount", { count: chatMessages.length || t("vendor.bookingsPage.chatOpen") })}
                      </Button>
                      <Button
                        size="sm"
                        disabled={busy === booking.id}
                        onClick={() => handleComplete(booking.id)}
                        className="gap-1 bg-emerald-600 text-white hover:bg-emerald-700"
                      >
                        <CheckCircle className="h-3.5 w-3.5" /> {t("vendor.bookingsPage.status.completed")}
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
                        <Ban className="h-3.5 w-3.5" /> {t("common.cancel")}
                      </Button>
                      </div>

                      {isExpanded && (
                        <div className="space-y-2 rounded-lg border border-border/40 bg-background/50 p-3">
                          <div className="max-h-64 space-y-2 overflow-y-auto">
                            {chatMessages.length === 0 ? (
                              <p className="py-4 text-center text-xs text-muted-foreground">{t("vendor.bookingsPage.noMessagesYet")}</p>
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
                              placeholder={t("aiChat.placeholder")}
                              className="flex-1 rounded-md border border-border/40 bg-background px-3 py-1.5 text-sm"
                              onKeyDown={(e) => { if (e.key === "Enter") sendMessage(booking.id); }}
                            />
                            <Button size="sm" onClick={() => sendMessage(booking.id)} className="gap-1">
                              <Send className="h-3.5 w-3.5" /> {t("common.submit")}
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
              );
            });
          })()}
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
            <DialogTitle>{t("vendor.bookingsPage.confirmAcceptTitle")}</DialogTitle>
          </DialogHeader>
          {acceptDialog && (
            <div className="space-y-3 py-2">
              <div className="rounded-lg border border-border/40 bg-background/60 p-3 text-sm">
                <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
                  <span className="text-muted-foreground">{t("vendor.bookingsPage.clientLabel")}</span>
                  <span className="font-medium">{acceptDialog.clientName}</span>

                  <span className="text-muted-foreground">{t("vendor.bookingsPage.eventLabel")}</span>
                  <span>
                    {acceptDialog.eventType
                      ? eventTypeLabel(normalizeEventType(acceptDialog.eventType))
                      : "—"}
                  </span>

                  <span className="text-muted-foreground">{t("booking.card.dateLabel")}</span>
                  <span>{formatDate(acceptDialog.eventDate)}</span>

                  {acceptDialog.startTime && acceptDialog.endTime && (
                    <>
                      <span className="text-muted-foreground">{t("vendor.bookingsPage.intervalLabel")}</span>
                      <span className="font-medium text-gold">
                        {acceptDialog.startTime}–{acceptDialog.endTime}
                      </span>
                    </>
                  )}

                  {acceptDialog.guestCount != null && (
                    <>
                      <span className="text-muted-foreground">{t("booking.card.guestsLabel")}</span>
                      <span>{acceptDialog.guestCount}</span>
                    </>
                  )}

                  {acceptDialog.agreedPrice != null &&
                    acceptDialog.agreedPrice > 0 && (
                      <>
                        <span className="text-muted-foreground">{t("vendor.bookingsPage.priceLabel")}</span>
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
                <Label htmlFor="accept-reply">{t("vendor.bookingsPage.messageForClient")}</Label>
                <Textarea
                  id="accept-reply"
                  value={acceptReply}
                  onChange={(e) => setAcceptReply(e.target.value)}
                  rows={3}
                  className="mt-1"
                  placeholder={t("vendor.bookingsPage.acceptReplyPlaceholder")}
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
              {t("common.cancel")}
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
              {t("vendor.bookingsPage.confirmAcceptTitle")}
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
            <DialogTitle>{t("vendor.bookingsPage.proposeTitle")}</DialogTitle>
          </DialogHeader>
          {proposeDialog && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg border border-border/40 bg-background/60 p-3 text-xs text-muted-foreground">
                {t("vendor.bookingsPage.priceRequestedByClient")}{" "}
                <span className="font-bold text-gold">
                  {proposeDialog.agreedPrice
                    ? `${proposeDialog.agreedPrice}€`
                    : t("vendor.bookingsPage.unspecifiedPrice")}
                </span>
                {proposeDialog.startTime && proposeDialog.endTime && (
                  <>
                    {" · "}{t("vendor.bookingsPage.intervalLabel")}{" "}
                    <span className="font-medium text-foreground">
                      {proposeDialog.startTime}–{proposeDialog.endTime}
                    </span>
                  </>
                )}
              </div>
              <div>
                <Label htmlFor="propose-amount">{t("vendor.bookingsPage.proposedAmount")}</Label>
                <Input
                  id="propose-amount"
                  type="number"
                  min="0"
                  value={proposeAmount}
                  onChange={(e) => setProposeAmount(e.target.value)}
                  className="mt-1"
                  placeholder={t("vendor.bookingsPage.proposedAmountPlaceholder")}
                />
              </div>
              <div>
                <Label htmlFor="propose-msg">{t("booking.card.messageOptional")}</Label>
                <Textarea
                  id="propose-msg"
                  value={proposeMessage}
                  onChange={(e) => setProposeMessage(e.target.value)}
                  rows={2}
                  className="mt-1"
                  placeholder={t("vendor.bookingsPage.proposeMessagePlaceholder")}
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
              {t("common.cancel")}
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
              {t("vendor.bookingsPage.sendOffer")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Message dialog (chat with the client) ─────────────── */}
      <Dialog
        open={!!messageDialog}
        onOpenChange={(v) => !v && setMessageDialog(null)}
      >
        <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {t("vendor.bookingsPage.messageTo", { name: messageDialog?.clientName ?? t("vendor.bookingsPage.clientLower") })}
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
              <div className="max-h-48 space-y-1.5 overflow-y-auto rounded-lg border border-border/30 bg-background/30 p-2 sm:max-h-64">
                {(chats[messageDialog.id] || []).length === 0 ? (
                  <p className="py-6 text-center text-xs text-muted-foreground">
                    {t("vendor.bookingsPage.noMessagesYetLong")}
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
                <Label htmlFor="msg-compose">{t("vendor.bookingsPage.composeLabel")}</Label>
                <Textarea
                  id="msg-compose"
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  rows={3}
                  className="mt-1"
                  placeholder={t("vendor.bookingsPage.composePlaceholder")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      sendMessageFromDialog();
                    }
                  }}
                />
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {t("vendor.bookingsPage.sendShortcutHint")}
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
              {t("common.close")}
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
              {t("common.submit")}
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
            <DialogTitle>{t("vendor.bookingsPage.cancelConfirmedTitle")}</DialogTitle>
          </DialogHeader>
          {cancelDialog && (
            <div className="space-y-3 py-2">
              <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-xs text-muted-foreground">
                {t("vendor.bookingsPage.cancelWarnBefore")}{" "}
                <strong>{formatDate(cancelDialog.eventDate)}</strong>{" "}
                {t("vendor.bookingsPage.cancelWarnAfter")}
              </div>
              <div>
                <Label htmlFor="artist-cancel-reason">{t("vendor.bookingsPage.reasonForClient")}</Label>
                <Textarea
                  id="artist-cancel-reason"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  rows={3}
                  className="mt-1"
                  placeholder={t("vendor.bookingsPage.cancelReasonPlaceholder")}
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
              {t("common.back")}
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
              {t("vendor.bookingsPage.cancelBooking")}
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
            <DialogTitle>{t("vendor.bookingsPage.rejectBooking")}</DialogTitle>
          </DialogHeader>
          {rejectDialog && (
            <div className="space-y-3 py-2">
              <p className="text-sm text-muted-foreground">
                {t("vendor.bookingsPage.rejectNoticeBefore")}{" "}
                <span className="font-medium text-foreground">
                  {rejectDialog.clientName}
                </span>{" "}
                {t("vendor.bookingsPage.rejectNoticeAfter")}
              </p>
              <div>
                <Label htmlFor="reject-reply">{t("vendor.bookingsPage.reasonForClient")}</Label>
                <Textarea
                  id="reject-reply"
                  value={rejectReply}
                  onChange={(e) => setRejectReply(e.target.value)}
                  rows={3}
                  className="mt-1"
                  placeholder={t("vendor.bookingsPage.defaultRejectReply")}
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
              {t("common.cancel")}
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
              {t("vendor.bookingsPage.rejectBooking")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
