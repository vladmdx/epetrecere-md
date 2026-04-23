"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Phone,
  Mail,
  Calendar as CalendarIcon,
  Users,
  MessageSquare,
  Clock,
  Loader2,
  Inbox,
  Music,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { VenueBookingTab } from "@/lib/db/queries/venue-bookings";

interface Booking {
  id: number;
  venueId: number | null;
  eventPlanId: number | null;
  clientUserId: string | null;
  clientName: string;
  clientPhone: string;
  clientEmail: string | null;
  eventType: string | null;
  eventDate: string;
  startTime: string | null;
  endTime: string | null;
  guestCount: number | null;
  agreedPrice: number | null;
  message: string | null;
  status: string;
  source: string | null;
  artistReply: string | null;
  createdAt: string;
  updatedAt: string;
  planTitle: string | null;
  userEmail: string | null;
  linkedArtists: Array<{
    id: number;
    name: string;
    slug: string;
    status: string;
  }>;
}

interface Props {
  venueId: number;
  venueCapacityMax: number | null;
  initialTab: VenueBookingTab;
  initialBookings: Booking[];
  counts: Record<VenueBookingTab, number>;
}

const TABS: Array<{ key: VenueBookingTab; label: string }> = [
  { key: "noi", label: "Noi" },
  { key: "acceptate", label: "Acceptate" },
  { key: "finalizate", label: "Finalizate" },
  { key: "anulate", label: "Anulate" },
];

const EVENT_TYPE_LABELS: Record<string, string> = {
  wedding: "Nuntă",
  nunta: "Nuntă",
  baptism: "Botez",
  botez: "Botez",
  cumatrie: "Cumătrie",
  corporate: "Corporate",
  birthday: "Aniversare",
  aniversare: "Aniversare",
  other: "Altele",
};

const EVENT_TYPE_BORDER: Record<string, string> = {
  wedding: "border-l-red-500",
  nunta: "border-l-red-500",
  baptism: "border-l-blue-500",
  botez: "border-l-blue-500",
  cumatrie: "border-l-cyan-500",
  corporate: "border-l-purple-500",
  birthday: "border-l-orange-500",
  aniversare: "border-l-orange-500",
};

const DECLINE_REASONS = [
  "Ocupat în data respectivă",
  "Prea mulți invitați pentru capacitatea sălii",
  "Tip eveniment incompatibil",
  "Buget nepotrivit",
  "Alt motiv",
];

export function VenueBookingsClient({
  venueCapacityMax,
  initialTab,
  initialBookings,
  counts,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [bookings, setBookings] = useState<Booking[]>(initialBookings);
  const [acceptDialog, setAcceptDialog] = useState<Booking | null>(null);
  const [declineDialog, setDeclineDialog] = useState<Booking | null>(null);
  const [acceptReply, setAcceptReply] = useState("");
  const [declineReason, setDeclineReason] = useState(DECLINE_REASONS[0]);
  const [declineMessage, setDeclineMessage] = useState("");
  const [busy, setBusy] = useState<number | null>(null);

  function switchTab(tab: VenueBookingTab) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.push(`/dashboard/sala/rezervari?${params.toString()}`);
  }

  async function confirmAccept() {
    if (!acceptDialog) return;
    setBusy(acceptDialog.id);
    try {
      const res = await fetch(`/api/booking-requests/${acceptDialog.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "accept",
          reply: acceptReply.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Nu s-a putut accepta");
        return;
      }
      toast.success("Rezervare acceptată!");
      setAcceptDialog(null);
      setAcceptReply("");
      setBookings((prev) => prev.filter((b) => b.id !== acceptDialog.id));
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function confirmDecline() {
    if (!declineDialog) return;
    setBusy(declineDialog.id);
    try {
      const reply =
        declineMessage.trim().length > 0
          ? `${declineReason}. ${declineMessage.trim()}`
          : declineReason;
      const res = await fetch(`/api/booking-requests/${declineDialog.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reject",
          reply,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Nu s-a putut refuza");
        return;
      }
      toast.success("Rezervare refuzată");
      setDeclineDialog(null);
      setDeclineMessage("");
      setDeclineReason(DECLINE_REASONS[0]);
      setBookings((prev) => prev.filter((b) => b.id !== declineDialog.id));
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading text-2xl font-bold">Rezervări</h1>
        <p className="text-muted-foreground">
          Gestionează solicitările primite pentru sala ta.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-border/40">
        {TABS.map((tab) => {
          const isActive = initialTab === tab.key;
          const count = counts[tab.key];
          return (
            <button
              key={tab.key}
              onClick={() => switchTab(tab.key)}
              className={cn(
                "relative -mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "border-gold text-gold"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
              {count > 0 && (
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-bold",
                    isActive
                      ? "bg-gold/20 text-gold"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Bookings list */}
      {bookings.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-16 text-center">
            <Inbox className="mb-3 h-12 w-12 text-muted-foreground/50" />
            <h3 className="font-heading text-lg font-bold">Nicio rezervare aici</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {initialTab === "noi"
                ? "Solicitările noi vor apărea aici când clienții trimit cereri."
                : "Nu există rezervări cu acest status."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {bookings.map((b) => {
            const eventKey = (b.eventType || "other").toLowerCase();
            const eventLabel = EVENT_TYPE_LABELS[eventKey] || b.eventType || "Eveniment";
            const borderColor = EVENT_TYPE_BORDER[eventKey] || "border-l-muted-foreground";
            const overCapacity =
              venueCapacityMax !== null &&
              b.guestCount !== null &&
              b.guestCount > venueCapacityMax;
            const isNew = initialTab === "noi";
            const isAccepted = initialTab === "acceptate";

            return (
              <Card key={b.id} className={cn("border-l-4", borderColor)}>
                <CardContent className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1 space-y-3">
                      {/* Header row */}
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-muted/50 px-2.5 py-0.5 text-xs font-medium">
                          {eventLabel}
                        </span>
                        {b.planTitle && (
                          <span className="rounded-full bg-gold/10 px-2.5 py-0.5 text-xs font-medium text-gold">
                            {b.planTitle}
                          </span>
                        )}
                        {b.source && (
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            via {b.source}
                          </span>
                        )}
                      </div>

                      {/* Event date (big) */}
                      <div>
                        <h3 className="font-heading text-xl font-bold">
                          {new Date(b.eventDate).toLocaleDateString("ro-RO", {
                            weekday: "long",
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                          })}
                        </h3>
                        {(b.startTime || b.endTime) && (
                          <p className="text-sm text-muted-foreground">
                            <Clock className="mr-1 inline h-3.5 w-3.5" />
                            {b.startTime || ""}
                            {b.startTime && b.endTime && " – "}
                            {b.endTime || ""}
                          </p>
                        )}
                      </div>

                      {/* Client info */}
                      <div className="space-y-1 text-sm">
                        <p className="font-semibold">{b.clientName}</p>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          {b.clientPhone && b.clientPhone !== "—" && (
                            <a
                              href={`tel:${b.clientPhone}`}
                              className="inline-flex items-center gap-1 hover:text-gold"
                            >
                              <Phone className="h-3 w-3" />
                              {b.clientPhone}
                            </a>
                          )}
                          {(b.clientEmail || b.userEmail) && (
                            <a
                              href={`mailto:${b.clientEmail || b.userEmail}`}
                              className="inline-flex items-center gap-1 hover:text-gold"
                            >
                              <Mail className="h-3 w-3" />
                              {b.clientEmail || b.userEmail}
                            </a>
                          )}
                          {b.guestCount && (
                            <span className="inline-flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              {b.guestCount} pers.
                            </span>
                          )}
                          {b.agreedPrice && (
                            <span className="inline-flex items-center gap-1 font-medium text-foreground">
                              {b.agreedPrice}€
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Capacity warning */}
                      {overCapacity && (
                        <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-500">
                          <AlertTriangle className="h-4 w-4 shrink-0" />
                          <span>
                            <strong>{b.guestCount} persoane</strong> — depășește
                            capacitatea sălii (max {venueCapacityMax})
                          </span>
                        </div>
                      )}

                      {/* Message */}
                      {b.message && (
                        <div className="rounded-lg border border-border/30 bg-muted/20 p-3">
                          <p className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                            <MessageSquare className="h-3 w-3" />
                            Mesaj client
                          </p>
                          <p className="text-sm">{b.message}</p>
                        </div>
                      )}

                      {/* Linked artists from the same event plan */}
                      {b.linkedArtists.length > 0 && (
                        <div className="rounded-lg border border-purple-500/30 bg-purple-500/5 p-3">
                          <p className="mb-2 flex items-center gap-1 text-[10px] uppercase tracking-wider text-purple-300">
                            <Music className="h-3 w-3" />
                            {b.linkedArtists.length}{" "}
                            {b.linkedArtists.length === 1 ? "artist confirmat" : "artiști confirmați"}{" "}
                            pentru același eveniment
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {b.linkedArtists.map((a) => (
                              <Link
                                key={a.id}
                                href={`/artisti/${a.slug}`}
                                target="_blank"
                                className="inline-flex items-center gap-1 rounded-full bg-purple-500/15 px-2 py-1 text-xs text-purple-300 hover:bg-purple-500/25"
                              >
                                {a.name}
                                <ExternalLink className="h-2.5 w-2.5" />
                              </Link>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Artist reply (for accepted/declined) */}
                      {b.artistReply && initialTab !== "noi" && (
                        <div className="rounded-lg border border-gold/20 bg-gold/5 p-3">
                          <p className="mb-1 text-[10px] uppercase tracking-wider text-gold">
                            Răspunsul tău
                          </p>
                          <p className="text-sm">{b.artistReply}</p>
                        </div>
                      )}

                      <p className="text-[10px] text-muted-foreground/60">
                        Primită {new Date(b.createdAt).toLocaleString("ro-RO")}
                      </p>
                    </div>

                    {/* Actions column */}
                    {isNew && (
                      <div className="flex flex-col gap-2">
                        <Button
                          onClick={() => {
                            setAcceptDialog(b);
                            setAcceptReply("");
                          }}
                          disabled={busy === b.id}
                          className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
                        >
                          <CheckCircle className="h-4 w-4" />
                          Acceptă
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setDeclineDialog(b);
                            setDeclineReason(DECLINE_REASONS[0]);
                            setDeclineMessage("");
                          }}
                          disabled={busy === b.id}
                          className="gap-1.5 border-red-500/40 text-red-400 hover:bg-red-500/10"
                        >
                          <XCircle className="h-4 w-4" />
                          Refuză
                        </Button>
                      </div>
                    )}

                    {isAccepted && (
                      <div className="flex flex-col gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-400">
                          <CheckCircle className="h-3 w-3" />
                          Acceptată
                        </span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Accept dialog */}
      <Dialog
        open={!!acceptDialog}
        onOpenChange={(v) => !v && setAcceptDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmă acceptarea</DialogTitle>
            <DialogDescription>
              {acceptDialog && (
                <>
                  Confirmi rezervarea pentru{" "}
                  <strong>
                    {EVENT_TYPE_LABELS[(acceptDialog.eventType || "other").toLowerCase()] ||
                      acceptDialog.eventType ||
                      "eveniment"}
                  </strong>{" "}
                  pe{" "}
                  <strong>
                    {new Date(acceptDialog.eventDate).toLocaleDateString("ro-RO", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </strong>
                  {acceptDialog.guestCount
                    ? ` cu ${acceptDialog.guestCount} persoane?`
                    : "?"}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs text-muted-foreground">
              <CalendarIcon className="mr-1.5 inline h-3.5 w-3.5 text-emerald-400" />
              Calendar: ziua respectivă va fi marcată automat ca{" "}
              <strong>Rezervat</strong> și nu va mai fi disponibilă pentru alți
              clienți.
            </div>
            <div>
              <Label htmlFor="accept-reply" className="text-xs">
                Mesaj pentru client (opțional)
              </Label>
              <Textarea
                id="accept-reply"
                value={acceptReply}
                onChange={(e) => setAcceptReply(e.target.value)}
                rows={3}
                className="mt-1"
                placeholder="Mulțumim pentru alegere! Ne vedem curând."
              />
            </div>
          </div>
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
              Confirmă
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Decline dialog */}
      <Dialog
        open={!!declineDialog}
        onOpenChange={(v) => !v && setDeclineDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Refuză rezervarea</DialogTitle>
            <DialogDescription>
              Calendarul nu va fi modificat — ziua rămâne disponibilă pentru alți clienți.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Motiv</Label>
              <Select
                value={declineReason}
                onValueChange={(v) => setDeclineReason(v ?? DECLINE_REASONS[0])}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DECLINE_REASONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="decline-msg" className="text-xs">
                Mesaj suplimentar (opțional)
              </Label>
              <Textarea
                id="decline-msg"
                value={declineMessage}
                onChange={(e) => setDeclineMessage(e.target.value)}
                rows={3}
                className="mt-1"
                placeholder="Detalii suplimentare pentru client..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeclineDialog(null)}
              disabled={busy === declineDialog?.id}
            >
              Anulează
            </Button>
            <Button
              onClick={confirmDecline}
              disabled={busy === declineDialog?.id}
              variant="outline"
              className="gap-1.5 border-red-500/40 text-red-400 hover:bg-red-500/10"
            >
              {busy === declineDialog?.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              Refuză
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
