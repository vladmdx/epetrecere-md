"use client";

import { useState, useEffect, useCallback, type ReactElement } from "react";
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
import { useLocale } from "@/hooks/use-locale";
import { NOUNS, plural, type AllForms } from "@/lib/i18n/plural";

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
  clientConfirmedAt?: string | null;
  artistReply: string | null;
  artistName: string | null;
  artistSlug: string | null;
  categoryNames?: string[] | null;
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

// Both maps hold translation KEYS, not copy — the label is resolved at
// render time so a status badge follows the reader's language.
const statusConfig: Record<string, { labelKey: string; color: string }> = {
  pending: { labelKey: "cabinet.reservations.statusPending", color: "text-warning border-warning/30 bg-warning/5" },
  accepted: { labelKey: "cabinet.reservations.statusAccepted", color: "text-success border-success/30 bg-success/5" },
  confirmed_by_client: { labelKey: "cabinet.reservations.statusConfirmed", color: "text-success border-success/30 bg-success/5" },
  rejected: { labelKey: "cabinet.reservations.statusRejected", color: "text-destructive border-destructive/30 bg-destructive/5" },
  cancelled: { labelKey: "cabinet.reservations.statusCancelled", color: "text-muted-foreground border-border/40 bg-muted/5" },
  completed: { labelKey: "cabinet.reservations.statusCompleted", color: "text-gold border-gold/30 bg-gold/5" },
};

const EVENT_TYPE_LABEL_KEYS: Record<string, string> = {
  wedding: "event_types.wedding",
  baptism: "event_types.baptism",
  cumatrie: "event_types.cumatrie",
  corporate: "event_types.corporate",
  birthday: "event_types.birthday",
  other: "cabinet.reservations.eventOther",
};

/** Plural forms live next to `plural()` rather than in the dictionary —
 *  a flat key/value map cannot express three Russian forms. */
const BOOKINGS: AllForms = {
  ro: { one: "rezervare", few: "rezervări", many: "rezervări" },
  ru: { one: "бронирование", few: "бронирования", many: "бронирований" },
  en: { one: "booking", other: "bookings" },
};

export default function ReservationsPage() {
  const { t, locale } = useLocale();
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
        toast.error(err.error || t("cabinet.reservations.confirmError"));
        return;
      }
      const result = await res.json();
      toast.success(t(result.awaitingVenue ? "booking.awaitingVenue" : "cabinet.reservations.confirmed"));
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  async function cancelBooking(b: BookingRequest) {
    if (!confirm(t("cabinet.reservations.cancelConfirm"))) return;
    setBusy(b.id);
    try {
      const res = await fetch(`/api/booking-requests/${b.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || t("cabinet.reservations.cancelError"));
        return;
      }
      toast.success(t("cabinet.reservations.cancelled"));
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  async function confirmPropose() {
    if (!proposeDialog) return;
    const amt = Number(proposeAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error(t("cabinet.reservations.invalidAmount"));
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
        toast.error(err.error || t("cabinet.reservations.offerError"));
        return;
      }
      toast.success(t("cabinet.reservations.offerSent"));
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
      toast.error(t("cabinet.reservations.emptyMessage"));
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
        toast.error(t("cabinet.reservations.messageError"));
        return;
      }
      toast.success(t("cabinet.reservations.messageSent"));
      setMessageText("");
      const r = await fetch(`/api/chat?booking_request_id=${messageDialog.id}`);
      if (r.ok) {
        const data = await r.json();
        setChats(prev => ({ ...prev, [messageDialog.id]: Array.isArray(data) ? data : [] }));
      }
    } catch {
      toast.error(t("cabinet.reservations.sendError"));
    } finally {
      setMessageSending(false);
    }
  }

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div>;
  }

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold mb-1">{t("cabinet.reservations.title")}</h1>
      <p className="text-sm text-muted-foreground mb-6">
        {t("cabinet.reservations.totalCount", {
          count: plural(bookings.length, locale, BOOKINGS),
        })}
      </p>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "active" | "past")}>
        <TabsList>
          <TabsTrigger value="active" className="gap-1.5">
            {t("cabinet.reservations.tabActive")}
            {activeBookings.length > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-gold/20 px-1 text-[10px] font-bold text-gold">
                {activeBookings.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="past">
            {t("cabinet.reservations.tabPast")} ({pastBookings.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-4">
          {activeBookings.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Calendar className="mx-auto mb-3 h-8 w-8 opacity-40" />
              <p>{t("cabinet.reservations.emptyActive")}</p>
              <p className="text-xs mt-1">{t("cabinet.reservations.emptyActiveHint")}</p>
            </div>
          ) : (
            <BookingsByEvent bookings={activeBookings} render={renderBookingCard} />
          )}
        </TabsContent>

        <TabsContent value="past" className="mt-4">
          {pastBookings.length === 0 ? (
            <p className="py-12 text-center text-muted-foreground">{t("cabinet.reservations.emptyPast")}</p>
          ) : (
            <BookingsByEvent bookings={pastBookings} render={renderBookingCard} />
          )}
        </TabsContent>
      </Tabs>

      {/* Propose price dialog */}
      <Dialog open={!!proposeDialog} onOpenChange={(o) => !o && setProposeDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("cabinet.reservations.proposeTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t("cabinet.reservations.priceLabel")}</Label>
              <Input
                type="number"
                value={proposeAmount}
                onChange={(e) => setProposeAmount(e.target.value)}
                placeholder={t("cabinet.reservations.pricePlaceholder")}
                autoFocus
              />
            </div>
            <div>
              <Label>{t("cabinet.reservations.messageOptional")}</Label>
              <Textarea
                value={proposeMessage}
                onChange={(e) => setProposeMessage(e.target.value)}
                placeholder={t("cabinet.reservations.messagePlaceholder")}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProposeDialog(null)}>{t("common.cancel")}</Button>
            <Button onClick={confirmPropose} disabled={busy === proposeDialog?.id} className="bg-gold text-[#0D0D0D] hover:bg-gold-dark">
              {busy === proposeDialog?.id ? <Loader2 className="h-4 w-4 animate-spin" /> : t("cabinet.reservations.sendOffer")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Message dialog */}
      <Dialog open={!!messageDialog} onOpenChange={(o) => !o && setMessageDialog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {t("cabinet.reservations.chatTitle", {
                name:
                  messageDialog?.artistName ??
                  t("cabinet.reservations.partnerFallback"),
              })}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {/* History */}
            <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border border-border/40 bg-background/50 p-3">
              {chats[messageDialog?.id ?? -1]?.length === 0 ? (
                <p className="text-center text-xs text-muted-foreground py-8">{t("cabinet.reservations.noMessages")}</p>
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
              placeholder={t("cabinet.reservations.chatPlaceholder")}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMessageDialog(null)}>{t("common.close")}</Button>
            <Button onClick={sendMessageFromDialog} disabled={messageSending} className="bg-gold text-[#0D0D0D] hover:bg-gold-dark gap-1">
              {messageSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-4 w-4" /> {t("common.submit")}</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );

  function renderBookingCard(b: BookingRequest) {
    const cfg = statusConfig[b.status] || statusConfig.pending;
    const eventTypeKey = b.eventType ? EVENT_TYPE_LABEL_KEYS[b.eventType] : null;
    const eventLabel = eventTypeKey
      ? t(eventTypeKey)
      : b.eventType || t("cabinet.reservations.eventFallback");

    const offers = b.priceOffers ?? [];
    const lastOffer = offers.length > 0 ? offers[offers.length - 1] : null;
    const canConfirmAccepted = b.status === "accepted" && !b.clientConfirmedAt;

    return (
      <Card key={b.id} className="transition-all hover:border-gold/30">
        <CardContent className="py-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 space-y-2 min-w-0">
              {/* Header */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-heading font-semibold text-base">{eventLabel}</span>
                <Badge variant="outline" className={cn("text-xs", cfg.color)}>{t(cfg.labelKey)}</Badge>
                {b.categoryNames && b.categoryNames.length > 0 && (
                  <Badge variant="outline" className="text-xs text-gold/80 border-gold/30 bg-gold/5">
                    {b.categoryNames.join(" · ")}
                  </Badge>
                )}
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
                    {plural(b.guestCount, locale, NOUNS.guests)}
                  </span>
                )}
              </div>

              {/* Initial message */}
              {b.message && (
                <div className="rounded-lg bg-accent/30 p-2.5 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{t("cabinet.reservations.yourMessage")}</span> {b.message}
                </div>
              )}

              {/* Artist reply */}
              {b.artistReply && (
                <div className="rounded-lg bg-gold/5 border border-gold/10 p-2.5 text-xs">
                  <span className="font-medium text-gold">{t("cabinet.reservations.partnerReply")}</span>{" "}
                  <span className="text-foreground">{b.artistReply}</span>
                </div>
              )}

              {/* Price negotiation history */}
              {offers.length > 0 && (
                <div className="rounded-lg border border-gold/20 bg-gold/5 p-3 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-gold">
                    <HandCoins className="h-3.5 w-3.5" />
                    {t("cabinet.reservations.offerHistory")}
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
                              {offer.from === "client"
                                ? t("cabinet.reservations.offerFromYou")
                                : t("cabinet.reservations.offerFromPartner")}
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
                      {t("cabinet.reservations.awaitingPartner")}
                    </p>
                  )}
                </div>
              )}

              <p className="text-[10px] text-muted-foreground/60">
                {t("cabinet.reservations.sentOn", {
                  date: new Date(b.createdAt).toLocaleDateString("ro-MD"),
                })}
              </p>
            </div>

            {/* Actions */}
            <div className="flex flex-col items-stretch gap-2 shrink-0 min-w-[140px]">
              {b.status === "accepted" && b.clientConfirmedAt && <p className="text-sm text-gold">{t("booking.awaitingVenue")}</p>}
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
                  {t("cabinet.reservations.confirm")}
                </Button>
              )}

              {/* "Propune preț" / "Negociază" removed from the client
                  side — pricing is the partner's responsibility. The
                  client either confirms the partner's offer or waits.
                  Keeps the conversation cleaner: no back-and-forth
                  counter-offers from someone who shouldn't be quoting
                  the gig in the first place. */}

              {/* Message */}
              <Button
                size="sm"
                variant="outline"
                onClick={() => openMessageDialog(b)}
                className="gap-1"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                {t("cabinet.reservations.messageCta")}
              </Button>

              {/* Cancel — only after the partner has actually accepted.
                  While the request is "pending" the client has to wait
                  out the 24h response window. Cancelling pre-acceptance
                  rewards no-one and racks up cancelled-by-client noise
                  in the partner's CRM. After acceptance the client can
                  still back out. */}
              {b.status === "accepted" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => cancelBooking(b)}
                  disabled={busy === b.id}
                  className="gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  {t("common.cancel")}
                </Button>
              )}
              {b.status === "pending" && (
                <PendingCountdown createdAt={b.createdAt} />
              )}

              {b.artistSlug && (
                <Link href={`/artisti/${b.artistSlug}`}>
                  <Button variant="ghost" size="sm" className="gap-1 text-xs w-full">
                    <Music className="h-3.5 w-3.5" /> {t("cabinet.reservations.profile")}
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

/**
 * Live 24-hour countdown for pending bookings. Replaces the old "you
 * can cancel any time" affordance — the client sees how long the
 * partner has left to respond instead. Auto-expiry happens server-side
 * via the cron sweep; this is purely UI feedback.
 */
function PendingCountdown({ createdAt }: { createdAt: string }) {
  const { t } = useLocale();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const created = new Date(createdAt).getTime();
  const expiresAt = created + 24 * 60 * 60 * 1000;
  const remaining = Math.max(0, expiresAt - now);
  const hours = Math.floor(remaining / (60 * 60 * 1000));
  const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
  const expired = remaining === 0;
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-1.5 text-center text-xs font-medium",
        expired
          ? "border-destructive/40 bg-destructive/5 text-destructive"
          : "border-amber-500/40 bg-amber-500/5 text-amber-500",
      )}
    >
      {expired ? (
        t("cabinet.reservations.expired")
      ) : (
        <>
          {t("cabinet.reservations.countdownPrefix")}{" "}
          <strong>
            {hours}h {String(minutes).padStart(2, "0")}m
          </strong>{" "}
          {t("cabinet.reservations.countdownSuffix")}
        </>
      )}
    </div>
  );
}

/**
 * Group a flat booking list into per-event sections, ordered by event
 * date ascending. Each group renders a header with the date + event
 * type + total bookings on that day so the client sees their day-level
 * agenda instead of a mixed feed.
 */
function BookingsByEvent({
  bookings,
  render,
}: {
  bookings: BookingRequest[];
  render: (b: BookingRequest) => ReactElement;
}) {
  const { t, locale } = useLocale();
  const groups = new Map<string, BookingRequest[]>();
  for (const b of bookings) {
    const key = b.eventDate ?? "fără-dată";
    const arr = groups.get(key);
    if (arr) arr.push(b);
    else groups.set(key, [b]);
  }
  const sortedKeys = Array.from(groups.keys()).sort((a, b) => {
    if (a === "fără-dată") return 1;
    if (b === "fără-dată") return -1;
    return a.localeCompare(b);
  });
  return (
    <div className="space-y-6">
      {sortedKeys.map((dateKey) => {
        const list = groups.get(dateKey) ?? [];
        const headerLabel =
          dateKey === "fără-dată"
            ? t("cabinet.reservations.noDate")
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
                {plural(list.length, locale, BOOKINGS)}
              </span>
            </div>
            {list.map((b) => render(b))}
          </div>
        );
      })}
    </div>
  );
}
