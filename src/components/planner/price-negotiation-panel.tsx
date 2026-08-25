"use client";

// Shared price-negotiation UI for both sides of a booking request.
// Renders the priceOffers[] timeline + action buttons that hit
// PUT /api/booking-requests/[id] with action: "accept" | "propose_price".

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  HandCoins,
  CheckCircle2,
  Loader2,
  ArrowLeftRight,
  Handshake,
  MessageCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocale } from "@/hooks/use-locale";

export type BookingPriceOffer = {
  from: "artist" | "client";
  amount: number;
  message?: string;
  at: string;
};

type NegotiationBooking = {
  id: number;
  status:
    | "pending"
    | "accepted"
    | "confirmed_by_client"
    | "rejected"
    | "cancelled"
    | "completed";
  agreedPrice: number | null;
  priceOffers: BookingPriceOffer[] | null;
};

export function PriceNegotiationPanel({
  booking,
  perspective,
  onUpdate,
}: {
  booking: NegotiationBooking;
  /** Whose side of the chat we're rendering — drives button labels & POST author. */
  perspective: "artist" | "client";
  /** Fires after any successful mutation so the parent can refresh its list. */
  onUpdate: () => void | Promise<void>;
}) {
  const { t } = useLocale();
  const [openPropose, setOpenPropose] = useState(false);
  const [openAccept, setOpenAccept] = useState(false);
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const offers = booking.priceOffers ?? [];
  const lastOffer = offers.length > 0 ? offers[offers.length - 1] : null;

  // If the last offer came from the OTHER side, this side has a pending
  // proposal to answer. When the last offer came from US we're waiting.
  const myLastIsWaiting = lastOffer?.from === perspective;
  const theirPendingOffer =
    lastOffer && lastOffer.from !== perspective ? lastOffer : null;

  async function proposePrice() {
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      toast.error(t("planner.negotiation.invalidAmount"));
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/booking-requests/${booking.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "propose_price",
          agreedPrice: amt,
          reply: message || undefined,
        }),
      });
      if (!res.ok) {
        toast.error(t("planner.negotiation.offerError"));
        return;
      }
      toast.success(t("planner.negotiation.offerSent"));
      setOpenPropose(false);
      setAmount("");
      setMessage("");
      await onUpdate();
    } catch {
      toast.error(t("planner.negotiation.networkError"));
    } finally {
      setBusy(false);
    }
  }

  async function acceptAtPrice(agreedAmount: number) {
    if (perspective !== "artist") {
      toast.error(t("planner.negotiation.artistOnly"));
      return;
    }
    if (!agreedAmount || agreedAmount <= 0) {
      toast.error(t("planner.negotiation.invalidPrice"));
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/booking-requests/${booking.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "accept",
          agreedPrice: agreedAmount,
          reply: message || "Rezervare acceptată la prețul convenit.",
        }),
      });
      if (!res.ok) {
        toast.error(t("planner.negotiation.acceptError"));
        return;
      }
      toast.success(t("planner.negotiation.accepted"));
      setOpenAccept(false);
      setAmount("");
      setMessage("");
      await onUpdate();
    } catch {
      toast.error(t("planner.negotiation.networkError"));
    } finally {
      setBusy(false);
    }
  }

  async function clientConfirm() {
    if (perspective !== "client") return;
    setBusy(true);
    try {
      const res = await fetch(`/api/booking-requests/${booking.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "client_confirm" }),
      });
      if (!res.ok) {
        toast.error(t("planner.negotiation.confirmError"));
        return;
      }
      toast.success(t("planner.negotiation.confirmed"));
      await onUpdate();
    } finally {
      setBusy(false);
    }
  }

  // Terminal states — nothing to negotiate anymore.
  const terminal = ["rejected", "cancelled"].includes(booking.status);
  if (terminal) return null;

  return (
    <div className="space-y-3">
      {/* ─── Offer Timeline ──────────────────────────────────────── */}
      {offers.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            {t("planner.negotiation.history")}
          </p>
          <div className="space-y-1.5">
            {offers.map((o, i) => (
              <div
                key={i}
                className={cn(
                  "flex items-start gap-2 rounded-lg px-3 py-2 text-sm",
                  o.from === perspective
                    ? "ml-8 bg-gold/5 border border-gold/20"
                    : "mr-8 bg-accent/30 border border-border/30",
                )}
              >
                <HandCoins
                  className={cn(
                    "h-3.5 w-3.5 mt-0.5 shrink-0",
                    o.from === perspective ? "text-gold" : "text-muted-foreground",
                  )}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">
                    {o.from === perspective
                      ? t("planner.negotiation.yourOffer")
                      : t("planner.negotiation.theirOffer")}
                    {" · "}
                    {new Date(o.at).toLocaleDateString("ro-RO", {
                      day: "numeric",
                      month: "short",
                    })}
                    {" "}
                    {new Date(o.at).toLocaleTimeString("ro-RO", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                  <p className="font-semibold text-gold">{o.amount}€</p>
                  {o.message && (
                    <p className="mt-1 text-xs text-muted-foreground italic">
                      &ldquo;{o.message}&rdquo;
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Action row ──────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {/* Artist can accept-at-price (seal) OR counter. */}
        {perspective === "artist" && booking.status === "pending" && (
          <>
            {theirPendingOffer && (
              <Button
                size="sm"
                onClick={() => acceptAtPrice(theirPendingOffer.amount)}
                disabled={busy}
                className="gap-1 bg-success text-white hover:bg-success/90"
              >
                <Handshake className="h-3.5 w-3.5" />
                {t("planner.negotiation.acceptAt", {
                  amount: theirPendingOffer.amount,
                })}
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setOpenPropose(true)}
              disabled={busy}
              className="gap-1"
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
              {theirPendingOffer
                ? t("planner.negotiation.counterOffer")
                : t("planner.negotiation.proposePrice")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setOpenAccept(true)}
              disabled={busy}
              className="gap-1 border-success/50 text-success hover:bg-success/10"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {t("planner.negotiation.acceptAndSet")}
            </Button>
          </>
        )}

        {/* Client can accept artist's offer → confirm, or counter. */}
        {perspective === "client" && booking.status === "pending" && (
          <>
            {theirPendingOffer && (
              <Button
                size="sm"
                disabled={busy}
                onClick={() =>
                  proposePriceSameAs(theirPendingOffer.amount).catch(() => {})
                }
                className="gap-1 bg-gold text-[#0D0D0D] hover:bg-gold-dark"
              >
                <Handshake className="h-3.5 w-3.5" />
                {t("planner.negotiation.agreeTo", {
                  amount: theirPendingOffer.amount,
                })}
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setOpenPropose(true)}
              disabled={busy}
              className="gap-1"
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
              {theirPendingOffer
                ? t("planner.negotiation.counterOffer")
                : t("planner.negotiation.proposePrice")}
            </Button>
          </>
        )}

        {/* Client final confirmation when artist has already accepted. */}
        {perspective === "client" && booking.status === "accepted" && (
          <Button
            size="sm"
            disabled={busy}
            onClick={clientConfirm}
            className="gap-1 bg-gold text-[#0D0D0D] hover:bg-gold-dark"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            {t("planner.negotiation.confirmBooking")}
            {booking.agreedPrice ? ` (${booking.agreedPrice}€)` : ""}
          </Button>
        )}

        {myLastIsWaiting && booking.status === "pending" && (
          <span className="text-xs text-muted-foreground self-center">
            <MessageCircle className="inline h-3 w-3 mr-1" />
            {t("planner.negotiation.awaitingReply")}
          </span>
        )}
      </div>

      {/* ─── Propose dialog ──────────────────────────────────────── */}
      <Dialog open={openPropose} onOpenChange={setOpenPropose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("planner.negotiation.proposeTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="price">{t("planner.negotiation.amountLabel")}</Label>
              <Input
                id="price"
                type="number"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={t("planner.negotiation.amountPlaceholder")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="msg">{t("planner.negotiation.messageOptional")}</Label>
              <Textarea
                id="msg"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={2}
                placeholder={t("planner.negotiation.messagePlaceholder")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenPropose(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              disabled={busy || !amount}
              onClick={proposePrice}
              className="bg-gold text-[#0D0D0D] hover:bg-gold-dark"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                t("planner.negotiation.sendOffer")
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Accept-with-price dialog (artist only) ─────────────── */}
      <Dialog open={openAccept} onOpenChange={setOpenAccept}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("planner.negotiation.acceptTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="price-accept">{t("planner.negotiation.finalPriceLabel")}</Label>
              <Input
                id="price-accept"
                type="number"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={t("planner.negotiation.amountPlaceholder")}
              />
              <p className="text-xs text-muted-foreground">
                {t("planner.negotiation.budgetNote")}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="msg-accept">{t("planner.negotiation.clientMessageLabel")}</Label>
              <Textarea
                id="msg-accept"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={2}
                placeholder={t("planner.negotiation.clientMessagePlaceholder")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenAccept(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              disabled={busy || !amount}
              onClick={() => acceptAtPrice(Number(amount))}
              className="bg-success text-white hover:bg-success/90"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                t("planner.negotiation.acceptAndSeal")
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );

  /**
   * Client shortcut: mirror the artist's amount as a new client-side
   * offer (same number, empty message) — signals "I agree". The artist
   * then seals it with an accept-at-price action.
   */
  async function proposePriceSameAs(amt: number) {
    setBusy(true);
    try {
      const res = await fetch(`/api/booking-requests/${booking.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "propose_price",
          agreedPrice: amt,
          reply: "Sunt de acord cu prețul.",
        }),
      });
      if (!res.ok) {
        toast.error(t("planner.negotiation.genericError"));
        return;
      }
      toast.success(t("planner.negotiation.agreementSent"));
      await onUpdate();
    } finally {
      setBusy(false);
    }
  }
}
