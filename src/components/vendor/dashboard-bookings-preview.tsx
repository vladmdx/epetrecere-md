"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  Calendar,
  Clock,
  Users,
  Euro,
  CheckCircle,
  XCircle,
  HandCoins,
  MessageSquare,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { normalizeEventType, eventTypeLabel } from "@/lib/events/normalize";
import { toast } from "sonner";
import type { BookingPriceOffer } from "@/components/planner/price-negotiation-panel";
import { useLocale } from "@/hooks/use-locale";

type BookingRequest = {
  id: number;
  artistId: number;
  clientName: string;
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
};

const statusConfig: Record<string, { labelKey: string; color: string }> = {
  pending: { labelKey: "vendorBookingsPreview.statusPending", color: "bg-warning/10 text-warning border-warning/30" },
  accepted: { labelKey: "vendorBookingsPreview.statusAccepted", color: "bg-amber-500/10 text-amber-500 border-amber-500/30" },
  confirmed_by_client: { labelKey: "vendorBookingsPreview.statusConfirmed", color: "bg-success/10 text-success border-success/30" },
};

const PREVIEW_LIMIT = 5;

interface Props {
  artistId: number;
}

export function DashboardBookingsPreview({ artistId }: Props) {
  const { t } = useLocale();
  const { isLoaded } = useUser();
  const [bookings, setBookings] = useState<BookingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);

  const [acceptDialog, setAcceptDialog] = useState<BookingRequest | null>(null);
  const [acceptReply, setAcceptReply] = useState("");
  const [rejectDialog, setRejectDialog] = useState<BookingRequest | null>(null);
  const [rejectReply, setRejectReply] = useState("");
  const [proposeDialog, setProposeDialog] = useState<BookingRequest | null>(null);
  const [proposeAmount, setProposeAmount] = useState("");
  const [proposeMessage, setProposeMessage] = useState("");

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`/api/booking-requests?artist_id=${artistId}`);
      if (r.ok) {
        const data = await r.json();
        setBookings(Array.isArray(data) ? data : []);
      }
    } catch {
      // silent
    }
  }, [artistId]);

  useEffect(() => {
    if (!isLoaded) return;
    refresh().finally(() => setLoading(false));
  }, [isLoaded, refresh]);

  const activeBookings = bookings.filter((b) => b.status === "pending");
  const acceptedBookings = bookings.filter(
    (b) => b.status === "accepted" || b.status === "confirmed_by_client",
  );

  async function confirmAccept() {
    if (!acceptDialog) return;
    setBusy(acceptDialog.id);
    try {
      const res = await fetch(`/api/booking-requests/${acceptDialog.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "accept",
          reply: acceptReply.trim() || t("vendorBookingsPreview.defaultAcceptReply"),
        }),
      });
      if (!res.ok) {
        toast.error(t("vendorBookingsPreview.acceptFailed"));
        return;
      }
      toast.success(t("vendorBookingsPreview.acceptSuccess"));
      setAcceptDialog(null);
      setAcceptReply("");
      await refresh();
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
          reply: rejectReply.trim() || t("vendorBookingsPreview.defaultRejectReply"),
        }),
      });
      if (!res.ok) {
        toast.error(t("vendorBookingsPreview.rejectFailed"));
        return;
      }
      toast.success(t("vendorBookingsPreview.rejectSuccess"));
      setRejectDialog(null);
      setRejectReply("");
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  async function confirmPropose() {
    if (!proposeDialog) return;
    const amt = Number(proposeAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error(t("vendorBookingsPreview.invalidAmount"));
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
        toast.error(t("vendorBookingsPreview.offerFailed"));
        return;
      }
      toast.success(t("vendorBookingsPreview.offerSuccess"));
      setProposeDialog(null);
      setProposeAmount("");
      setProposeMessage("");
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  function renderRow(b: BookingRequest) {
    const cfg = statusConfig[b.status];
    // A missing or unrecognised type keeps the neutral "Eveniment" caption.
    const eventTypeKey = normalizeEventType(b.eventType);
    const eventLabel = eventTypeKey ? eventTypeLabel(eventTypeKey) : t("vendorBookingsPreview.eventFallback");
    const isPending = b.status === "pending";
    const lastOffer = b.priceOffers && b.priceOffers.length > 0 ? b.priceOffers[b.priceOffers.length - 1] : null;
    const lastOfferIsFromClient = lastOffer?.from === "client";
    const lastOfferIsFromArtist = lastOffer?.from === "artist";
    // Partner is "waiting" when they made the last offer and client hasn't replied
    const waitingForClient = isPending && lastOfferIsFromArtist;
    // Partner needs to act when client made the last offer (or no offers yet)
    const needsAction = isPending && !waitingForClient;
    // Display price: use latest offer if any, else original
    const displayPrice = lastOffer?.amount ?? b.agreedPrice;

    return (
      <div
        key={b.id}
        className={cn(
          "flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background/50 p-3 transition-colors",
          waitingForClient ? "border-amber-500/30 bg-amber-500/5" : "border-border/40 hover:border-gold/30",
        )}
      >
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-sm">{b.clientName}</span>
            {waitingForClient ? (
              <Badge variant="outline" className="text-[10px] text-amber-500 border-amber-500/40 bg-amber-500/10">
                {t("vendorBookingsPreview.waitingForClient")}
              </Badge>
            ) : (
              <Badge variant="outline" className={cn("text-[10px]", cfg?.color)}>{cfg ? t(cfg.labelKey) : null}</Badge>
            )}
            {displayPrice !== null && displayPrice !== undefined && displayPrice > 0 && (
              <Badge variant="outline" className="text-[10px] gap-0.5 text-gold border-gold/30">
                <Euro className="h-3 w-3" /> {displayPrice}€
                {lastOffer && (
                  <span className="ml-0.5 opacity-70">
                    ({lastOffer.from === "client" ? t("vendorBookingsPreview.offerFromClient") : t("vendorBookingsPreview.offerFromYou")})
                  </span>
                )}
              </Badge>
            )}
            {lastOfferIsFromClient && isPending && (
              <Badge variant="outline" className="text-[10px] gap-0.5 text-blue-400 border-blue-500/30 bg-blue-500/5">
                {t("vendorBookingsPreview.clientCounteroffer")}
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {eventLabel}
            </span>
            {b.eventDate && (
              <span>
                {new Date(b.eventDate).toLocaleDateString("ro-MD", { day: "numeric", month: "short", year: "numeric" })}
              </span>
            )}
            {b.startTime && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {b.startTime}{b.endTime ? `–${b.endTime}` : ""}
              </span>
            )}
            {b.guestCount && (
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {b.guestCount}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {needsAction ? (
            <>
              <Button
                size="sm"
                onClick={() => setAcceptDialog(b)}
                disabled={busy === b.id}
                className="h-8 gap-1 bg-green-600 hover:bg-green-700 text-white text-xs"
                title={
                  lastOfferIsFromClient
                    ? t("vendorBookingsPreview.acceptAtAmount", { amount: lastOffer?.amount ?? "" })
                    : t("vendorBookingsPreview.accept")
                }
              >
                <CheckCircle className="h-3.5 w-3.5" />
                {lastOfferIsFromClient
                  ? t("vendorBookingsPreview.acceptAmount", { amount: lastOffer?.amount ?? "" })
                  : t("vendorBookingsPreview.accept")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setProposeAmount(String(lastOffer?.amount ?? b.agreedPrice ?? ""));
                  setProposeDialog(b);
                }}
                disabled={busy === b.id}
                className="h-8 gap-1 text-xs"
                title={t("vendorBookingsPreview.proposePrice")}
              >
                <HandCoins className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setRejectDialog(b)}
                disabled={busy === b.id}
                className="h-8 gap-1 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                title={t("vendorBookingsPreview.reject")}
              >
                <XCircle className="h-3.5 w-3.5" />
              </Button>
            </>
          ) : waitingForClient ? (
            <Link href="/dashboard/rezervari">
              <Button size="sm" variant="outline" className="h-8 gap-1 text-xs">
                <MessageSquare className="h-3.5 w-3.5" /> {t("vendorBookingsPreview.details")}
              </Button>
            </Link>
          ) : (
            <Link href="/dashboard/rezervari">
              <Button size="sm" variant="outline" className="h-8 gap-1 text-xs">
                <MessageSquare className="h-3.5 w-3.5" /> {t("vendorBookingsPreview.details")}
              </Button>
            </Link>
          )}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-gold" />
        </CardContent>
      </Card>
    );
  }

  if (activeBookings.length === 0 && acceptedBookings.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Active (pending) bookings */}
      {activeBookings.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base font-heading">
              {t("vendorBookingsPreview.newRequests", { count: activeBookings.length })}
            </CardTitle>
            {activeBookings.length > PREVIEW_LIMIT && (
              <Link href="/dashboard/rezervari" className="text-xs text-gold hover:underline flex items-center gap-1">
                {t("common.viewAll")} <ArrowRight className="h-3 w-3" />
              </Link>
            )}
          </CardHeader>
          <CardContent className="space-y-2">
            {activeBookings.slice(0, PREVIEW_LIMIT).map(renderRow)}
            {activeBookings.length > PREVIEW_LIMIT && (
              <Link href="/dashboard/rezervari" className="block w-full text-center text-xs text-gold hover:underline pt-2">
                {t("vendorBookingsPreview.viewAllCount", { count: activeBookings.length })}
              </Link>
            )}
          </CardContent>
        </Card>
      )}

      {/* Active/accepted bookings */}
      {acceptedBookings.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base font-heading">
              {t("vendorBookingsPreview.activeBookings", { count: acceptedBookings.length })}
            </CardTitle>
            {acceptedBookings.length > PREVIEW_LIMIT && (
              <Link href="/dashboard/rezervari" className="text-xs text-gold hover:underline flex items-center gap-1">
                {t("common.viewAll")} <ArrowRight className="h-3 w-3" />
              </Link>
            )}
          </CardHeader>
          <CardContent className="space-y-2">
            {acceptedBookings.slice(0, PREVIEW_LIMIT).map(renderRow)}
            {acceptedBookings.length > PREVIEW_LIMIT && (
              <Link href="/dashboard/rezervari" className="block w-full text-center text-xs text-gold hover:underline pt-2">
                {t("vendorBookingsPreview.viewAllCount", { count: acceptedBookings.length })}
              </Link>
            )}
          </CardContent>
        </Card>
      )}

      {/* Accept dialog */}
      <Dialog open={!!acceptDialog} onOpenChange={(o) => !o && setAcceptDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("vendorBookingsPreview.acceptDialogTitle")}</DialogTitle>
          </DialogHeader>
          <div>
            <Label>{t("vendorBookingsPreview.messageForClient")}</Label>
            <Textarea
              value={acceptReply}
              onChange={(e) => setAcceptReply(e.target.value)}
              rows={3}
              placeholder={t("vendorBookingsPreview.defaultAcceptReply")}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAcceptDialog(null)}>{t("common.cancel")}</Button>
            <Button onClick={confirmAccept} disabled={busy === acceptDialog?.id} className="bg-green-600 hover:bg-green-700 text-white gap-1">
              {busy === acceptDialog?.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
              {t("vendorBookingsPreview.accept")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={!!rejectDialog} onOpenChange={(o) => !o && setRejectDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("vendorBookingsPreview.rejectDialogTitle")}</DialogTitle>
          </DialogHeader>
          <div>
            <Label>{t("vendorBookingsPreview.messageForClient")}</Label>
            <Textarea
              value={rejectReply}
              onChange={(e) => setRejectReply(e.target.value)}
              rows={3}
              placeholder={t("vendorBookingsPreview.defaultRejectReply")}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialog(null)}>{t("common.cancel")}</Button>
            <Button onClick={confirmReject} disabled={busy === rejectDialog?.id} className="bg-destructive hover:bg-destructive/90 text-white gap-1">
              {busy === rejectDialog?.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
              {t("vendorBookingsPreview.reject")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Propose dialog */}
      <Dialog open={!!proposeDialog} onOpenChange={(o) => !o && setProposeDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("vendorBookingsPreview.proposeDialogTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t("vendorBookingsPreview.priceLabel")}</Label>
              <Input
                type="number"
                value={proposeAmount}
                onChange={(e) => setProposeAmount(e.target.value)}
                placeholder={t("vendorBookingsPreview.pricePlaceholder")}
                autoFocus
              />
            </div>
            <div>
              <Label>{t("vendorBookingsPreview.messageOptional")}</Label>
              <Textarea
                value={proposeMessage}
                onChange={(e) => setProposeMessage(e.target.value)}
                placeholder={t("vendorBookingsPreview.messagePlaceholder")}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProposeDialog(null)}>{t("common.cancel")}</Button>
            <Button onClick={confirmPropose} disabled={busy === proposeDialog?.id} className="bg-gold text-[#0D0D0D] hover:bg-gold-dark gap-1">
              {busy === proposeDialog?.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <HandCoins className="h-4 w-4" />}
              {t("vendorBookingsPreview.sendOffer")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
