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
      toast.error("Introdu o sumă validă.");
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
        toast.error("Eroare la trimiterea ofertei.");
        return;
      }
      toast.success("Ofertă trimisă.");
      setOpenPropose(false);
      setAmount("");
      setMessage("");
      await onUpdate();
    } catch {
      toast.error("Eroare de rețea.");
    } finally {
      setBusy(false);
    }
  }

  async function acceptAtPrice(agreedAmount: number) {
    if (perspective !== "artist") {
      toast.error("Doar artistul poate sigila prețul final.");
      return;
    }
    if (!agreedAmount || agreedAmount <= 0) {
      toast.error("Preț invalid.");
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
        toast.error("Eroare la acceptare.");
        return;
      }
      toast.success("Rezervare acceptată!");
      setOpenAccept(false);
      setAmount("");
      setMessage("");
      await onUpdate();
    } catch {
      toast.error("Eroare de rețea.");
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
        toast.error("Eroare la confirmare.");
        return;
      }
      toast.success("Rezervare confirmată! Suma e alocată în buget.");
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
            Istoric oferte
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
                    {o.from === perspective ? "Oferta ta" : "Oferta lor"}
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
                Acceptă la {theirPendingOffer.amount}€
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
              {theirPendingOffer ? "Contra-ofertă" : "Propune preț"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setOpenAccept(true)}
              disabled={busy}
              className="gap-1 border-success/50 text-success hover:bg-success/10"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Acceptă & setează preț
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
                className="gap-1 bg-gold text-background hover:bg-gold-dark"
              >
                <Handshake className="h-3.5 w-3.5" />
                Sunt de acord cu {theirPendingOffer.amount}€
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
              {theirPendingOffer ? "Contra-ofertă" : "Propune preț"}
            </Button>
          </>
        )}

        {/* Client final confirmation when artist has already accepted. */}
        {perspective === "client" && booking.status === "accepted" && (
          <Button
            size="sm"
            disabled={busy}
            onClick={clientConfirm}
            className="gap-1 bg-gold text-background hover:bg-gold-dark"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Confirmă rezervarea
            {booking.agreedPrice ? ` (${booking.agreedPrice}€)` : ""}
          </Button>
        )}

        {myLastIsWaiting && booking.status === "pending" && (
          <span className="text-xs text-muted-foreground self-center">
            <MessageCircle className="inline h-3 w-3 mr-1" />
            Se așteaptă răspuns…
          </span>
        )}
      </div>

      {/* ─── Propose dialog ──────────────────────────────────────── */}
      <Dialog open={openPropose} onOpenChange={setOpenPropose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Propune un preț</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="price">Sumă (EUR)</Label>
              <Input
                id="price"
                type="number"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Ex: 250"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="msg">Mesaj (opțional)</Label>
              <Textarea
                id="msg"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={2}
                placeholder="Ex: Prețul include 2 ore + echipament."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenPropose(false)}>
              Anulează
            </Button>
            <Button
              disabled={busy || !amount}
              onClick={proposePrice}
              className="bg-gold text-background hover:bg-gold-dark"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Trimite oferta"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Accept-with-price dialog (artist only) ─────────────── */}
      <Dialog open={openAccept} onOpenChange={setOpenAccept}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Acceptă rezervarea și setează prețul final</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="price-accept">Preț final (EUR)</Label>
              <Input
                id="price-accept"
                type="number"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Ex: 250"
              />
              <p className="text-xs text-muted-foreground">
                Această sumă va fi alocată în bugetul clientului.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="msg-accept">Mesaj pentru client</Label>
              <Textarea
                id="msg-accept"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={2}
                placeholder="Ex: Mulțumesc pentru rezervare!"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenAccept(false)}>
              Anulează
            </Button>
            <Button
              disabled={busy || !amount}
              onClick={() => acceptAtPrice(Number(amount))}
              className="bg-success text-white hover:bg-success/90"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Acceptă și sigilează"
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
        toast.error("Eroare.");
        return;
      }
      toast.success("Acord trimis. Aștepți sigilarea de la artist.");
      await onUpdate();
    } finally {
      setBusy(false);
    }
  }
}
