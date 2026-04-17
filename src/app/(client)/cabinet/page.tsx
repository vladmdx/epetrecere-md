"use client";

import { useState, useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import {
  Calendar,
  Loader2,
  Clock,
  Users,
  Music,
  ExternalLink,
  CheckCircle2,
  BookOpen,
  ClipboardList,
  Star,
  MessageCircle,
  ArrowRight,
} from "lucide-react";
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
  guestCount: number | null;
  message: string | null;
  status: string;
  artistReply: string | null;
  artistName: string | null;
  artistSlug: string | null;
  createdAt: string;
}

const statusConfig: Record<string, { label: string; color: string }> = {
  pending: { label: "In așteptare", color: "text-warning border-warning/30 bg-warning/5" },
  accepted: { label: "Acceptat de artist", color: "text-emerald-400 border-emerald-400/30 bg-emerald-400/5" },
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

export default function ClientCabinetPage() {
  const { isSignedIn, user: clerkUser } = useUser();
  const [bookings, setBookings] = useState<BookingRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSignedIn || !clerkUser?.primaryEmailAddress?.emailAddress) return;
    const email = clerkUser.primaryEmailAddress.emailAddress;
    fetch(`/api/booking-requests?client_email=${encodeURIComponent(email)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: BookingRequest[]) => {
        if (Array.isArray(data)) setBookings(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isSignedIn, clerkUser]);

  async function confirmBooking(id: number) {
    const res = await fetch(`/api/booking-requests/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "client_confirm" }),
    });
    if (!res.ok) {
      toast.error("Eroare la confirmare.");
      return;
    }
    toast.success("Rezervare confirmată!");
    setBookings((prev) =>
      prev.map((b) => (b.id === id ? { ...b, status: "confirmed_by_client" } : b)),
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  const activeBookings = bookings.filter((b) =>
    ["pending", "accepted", "confirmed_by_client"].includes(b.status),
  );

  return (
    <div className="mx-auto max-w-5xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-bold">
          Bun venit, {clerkUser?.firstName || "utilizator"}!
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Rezumatul evenimentelor și rezervărilor tale
        </p>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <Link href="/cabinet/rezervari" className="rounded-xl border border-border/40 bg-card p-4 text-center transition-all hover:border-gold/40">
          <BookOpen className="mx-auto mb-2 h-5 w-5 text-gold" />
          <p className="text-sm font-medium">Rezervări</p>
          <p className="text-xs text-muted-foreground">{bookings.length} total</p>
        </Link>
        <Link href="/cabinet/mesaje" className="rounded-xl border border-border/40 bg-card p-4 text-center transition-all hover:border-gold/40">
          <MessageCircle className="mx-auto mb-2 h-5 w-5 text-gold" />
          <p className="text-sm font-medium">Mesaje</p>
          <p className="text-xs text-muted-foreground">Conversații</p>
        </Link>
        <Link href="/cabinet/planifica" className="rounded-xl border border-border/40 bg-card p-4 text-center transition-all hover:border-gold/40">
          <ClipboardList className="mx-auto mb-2 h-5 w-5 text-gold" />
          <p className="text-sm font-medium">Planificator</p>
          <p className="text-xs text-muted-foreground">Eveniment</p>
        </Link>
        <Link href="/cabinet/recenzii" className="rounded-xl border border-border/40 bg-card p-4 text-center transition-all hover:border-gold/40">
          <Star className="mx-auto mb-2 h-5 w-5 text-gold" />
          <p className="text-sm font-medium">Recenzii</p>
          <p className="text-xs text-muted-foreground">Feedback</p>
        </Link>
      </div>

      {/* Active Bookings */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-heading text-lg font-semibold">Rezervări active</h2>
        {bookings.length > 0 && (
          <Link href="/cabinet/rezervari" className="text-xs text-gold hover:underline flex items-center gap-1">
            Vezi toate <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </div>

      {activeBookings.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Calendar className="mx-auto mb-3 h-8 w-8 text-gold/40" />
            <p className="text-muted-foreground">Nu ai rezervări active.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Explorează artiști și fă prima ta rezervare!
            </p>
            <Link
              href="/artisti"
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-gold px-4 py-2 text-sm font-medium text-background hover:bg-gold-dark"
            >
              Explorează artiști
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {activeBookings.map((b) => {
            const cfg = statusConfig[b.status] || statusConfig.pending;
            const eventLabel = b.eventType
              ? EVENT_TYPE_LABELS[b.eventType] || b.eventType
              : "Eveniment";

            return (
              <Card key={b.id} className="transition-all hover:border-gold/30">
                <CardContent className="py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      {/* Header: event type + status */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-heading font-semibold text-base">
                          {eventLabel}
                        </span>
                        <Badge variant="outline" className={cn("text-xs", cfg.color)}>
                          {cfg.label}
                        </Badge>
                      </div>

                      {/* Artist info */}
                      {b.artistName && (
                        <div className="flex items-center gap-2 text-sm">
                          <Music className="h-3.5 w-3.5 text-gold" />
                          {b.artistSlug ? (
                            <Link
                              href={`/artisti/${b.artistSlug}`}
                              className="font-medium hover:text-gold flex items-center gap-1"
                            >
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
                          {new Date(b.eventDate).toLocaleDateString("ro-MD", {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                          })}
                        </span>
                        {b.startTime && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            {b.startTime}
                            {b.endTime ? ` – ${b.endTime}` : ""}
                          </span>
                        )}
                        {b.guestCount && (
                          <span className="flex items-center gap-1">
                            <Users className="h-3.5 w-3.5" />
                            {b.guestCount} invitați
                          </span>
                        )}
                      </div>

                      {/* Client message */}
                      {b.message && (
                        <div className="rounded-lg bg-accent/30 p-2.5 text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">Mesajul tău:</span>{" "}
                          {b.message}
                        </div>
                      )}

                      {/* Artist reply */}
                      {b.artistReply && (
                        <div className="rounded-lg bg-gold/5 border border-gold/10 p-2.5 text-xs">
                          <span className="font-medium text-gold">Răspunsul artistului:</span>{" "}
                          <span className="text-foreground">{b.artistReply}</span>
                        </div>
                      )}

                      {/* Created date */}
                      <p className="text-[10px] text-muted-foreground/60">
                        Trimisă pe {new Date(b.createdAt).toLocaleDateString("ro-MD")}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col items-stretch gap-2 shrink-0">
                      {b.status === "accepted" && (
                        <Button
                          size="sm"
                          className="gap-1 bg-gold text-background hover:bg-gold-dark text-xs"
                          onClick={() => confirmBooking(b.id)}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" /> Confirmă
                        </Button>
                      )}
                      {b.artistSlug && (
                        <Link href={`/artisti/${b.artistSlug}`}>
                          <Button variant="outline" size="sm" className="gap-1 text-xs w-full">
                            <Music className="h-3.5 w-3.5" /> Profil
                          </Button>
                        </Link>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
