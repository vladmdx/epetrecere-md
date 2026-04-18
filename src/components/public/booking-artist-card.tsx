"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import { Star, BadgeCheck, Crown, Lock, Send, X, Loader2, ExternalLink, Check } from "lucide-react";
import { useUser } from "@clerk/nextjs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useLocale } from "@/hooks/use-locale";
import { getLocalized } from "@/i18n";

interface BookingArtistCardProps {
  artist: {
    id: number;
    slug: string;
    nameRo: string;
    nameRu: string | null;
    nameEn: string | null;
    descriptionRo: string | null;
    descriptionRu: string | null;
    descriptionEn: string | null;
    priceFrom: number | null;
    priceCurrency: string | null;
    ratingAvg: number | null;
    ratingCount: number | null;
    isVerified: boolean;
    isFeatured: boolean;
    isPremium: boolean;
    location: string | null;
    coverImageUrl?: string | null;
  };
  /** Pre-filled event context from the wizard/event plan */
  eventContext: {
    eventDate: string;
    eventType?: string;
    guestCount?: number;
    clientName: string;
    clientPhone: string;
    clientEmail?: string;
    eventPlanId?: number | null;
  };
  /** True if this artist is already booked for this event — disables button */
  alreadyBooked?: boolean;
  /** True if category limit reached — disables button */
  categoryLimitReached?: boolean;
  /** Called after a successful booking so parent can refresh state */
  onBookingSent?: (artistId: number) => void;
}

export function BookingArtistCard({
  artist,
  eventContext,
  alreadyBooked,
  categoryLimitReached,
  onBookingSent,
}: BookingArtistCardProps) {
  const { locale, t } = useLocale();
  const { isSignedIn, isLoaded } = useUser();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  // Hydration guard for portal
  if (typeof window !== "undefined" && !mounted) {
    setMounted(true);
  }

  const name = getLocalized(artist, "name", locale);
  const description = getLocalized(artist, "description", locale);
  const showPrice = isLoaded && isSignedIn;

  async function handleSubmit() {
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/booking-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          artistId: artist.id,
          clientName: eventContext.clientName,
          clientPhone: eventContext.clientPhone,
          clientEmail: eventContext.clientEmail,
          eventDate: eventContext.eventDate,
          eventType: eventContext.eventType,
          guestCount: eventContext.guestCount,
          message: message.trim() || undefined,
          eventPlanId: eventContext.eventPlanId ?? undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Eroare la trimitere");
      }
      toast.success(`Cerere trimisă către ${name}!`);
      setOpen(false);
      setMessage("");
      onBookingSent?.(artist.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Eroare la trimitere");
    } finally {
      setSubmitting(false);
    }
  }

  const disabled = alreadyBooked || categoryLimitReached;
  const buttonLabel = alreadyBooked
    ? "Cerere trimisă"
    : categoryLimitReached
      ? "Limită atinsă (5)"
      : "Solicită rezervare";

  const modal = open && mounted
    ? createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4"
          onClick={() => !submitting && setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-border/40 bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between border-b border-border/40 px-5 py-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Solicită rezervare
                </p>
                <p className="font-heading text-lg font-bold">{name}</p>
              </div>
              <button
                onClick={() => !submitting && setOpen(false)}
                className="rounded-full p-1.5 text-muted-foreground hover:bg-accent"
                aria-label="Închide"
                disabled={submitting}
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            <div className="space-y-4 px-5 py-4">
              {/* Event context (read-only) */}
              <div className="space-y-1 rounded-lg border border-border/40 bg-muted/30 p-3 text-sm">
                <p className="text-xs font-semibold text-muted-foreground">Detalii eveniment</p>
                <p><span className="text-muted-foreground">Data:</span> {new Date(eventContext.eventDate + "T00:00:00").toLocaleDateString("ro-RO", { day: "numeric", month: "long", year: "numeric" })}</p>
                {eventContext.eventType && (
                  <p><span className="text-muted-foreground">Tip:</span> {eventContext.eventType}</p>
                )}
                {eventContext.guestCount ? (
                  <p><span className="text-muted-foreground">Invitați:</span> {eventContext.guestCount}</p>
                ) : null}
                <p><span className="text-muted-foreground">Nume:</span> {eventContext.clientName}</p>
                <p><span className="text-muted-foreground">Telefon:</span> {eventContext.clientPhone}</p>
              </div>

              {/* Optional message */}
              <div>
                <Label htmlFor={`msg-${artist.id}`}>Mesaj (opțional)</Label>
                <Textarea
                  id={`msg-${artist.id}`}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                  placeholder="Alte detalii despre eveniment..."
                  className="mt-1"
                  disabled={submitting}
                />
              </div>
            </div>

            <footer className="flex items-center justify-between gap-2 border-t border-border/40 px-5 py-3">
              <Link
                href={`/artisti/${artist.slug}`}
                target="_blank"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-gold"
              >
                Vezi profil <ExternalLink className="h-3 w-3" />
              </Link>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setOpen(false)}
                  disabled={submitting}
                >
                  Anulează
                </Button>
                <Button
                  size="sm"
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="gap-2 bg-gold text-background hover:bg-gold-dark"
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  Trimite cerere
                </Button>
              </div>
            </footer>
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <div className="group flex flex-col overflow-hidden rounded-xl border border-border/40 bg-card transition-all duration-300 hover:border-gold/30">
        <Link href={`/artisti/${artist.slug}`} target="_blank" className="relative aspect-[4/5] bg-muted overflow-hidden">
          {artist.coverImageUrl ? (
            <Image
              src={artist.coverImageUrl}
              alt={name}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
              className="object-cover object-[center_20%] transition-transform duration-300 group-hover:scale-105"
              unoptimized={artist.coverImageUrl?.includes("r2.cloudflarestorage.com") ?? false}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
              <span className="text-4xl">🎵</span>
            </div>
          )}
          <div className="absolute left-2 top-2 flex gap-1">
            {artist.isVerified && (
              <Badge className="bg-gold/90 text-background text-xs gap-1">
                <BadgeCheck className="h-3 w-3" /> Verificat
              </Badge>
            )}
            {artist.isPremium && (
              <Badge className="bg-amber-600/90 text-white text-xs gap-1">
                <Crown className="h-3 w-3" /> Premium
              </Badge>
            )}
          </div>
        </Link>

        <div className="flex flex-1 flex-col p-4">
          <h3 className="font-heading text-base font-bold line-clamp-1">{name}</h3>
          {description && (
            <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{description}</p>
          )}

          <div className="mt-auto flex items-center justify-between pt-3">
            <div className="flex items-center gap-1">
              <Star className="h-3.5 w-3.5 fill-gold text-gold" />
              <span className="text-xs font-medium">
                {artist.ratingAvg ? artist.ratingAvg.toFixed(1) : "—"}
              </span>
              {artist.ratingCount ? (
                <span className="text-xs text-muted-foreground">({artist.ratingCount})</span>
              ) : null}
            </div>

            {artist.priceFrom ? (
              showPrice ? (
                <p className="font-accent text-sm font-semibold text-gold">
                  {t("common.from")} {artist.priceFrom}€
                </p>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 text-[11px] font-medium text-gold/90">
                  <Lock className="h-3 w-3" /> Preț la autentificare
                </span>
              )
            ) : null}
          </div>

          {artist.location && (
            <p className="mt-1 text-xs text-muted-foreground">📍 {artist.location}</p>
          )}

          <Button
            onClick={() => setOpen(true)}
            disabled={disabled}
            size="sm"
            className="mt-3 w-full gap-2 bg-gold text-background hover:bg-gold-dark disabled:opacity-60"
          >
            {alreadyBooked ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            {buttonLabel}
          </Button>
        </div>
      </div>
      {modal}
    </>
  );
}
