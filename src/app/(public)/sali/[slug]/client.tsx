"use client";

import Link from "next/link";
import { Star, MapPin, Users, Check, Lock } from "lucide-react";
import { useUser } from "@clerk/nextjs";
import { Badge } from "@/components/ui/badge";
import { ImageGallery } from "@/components/public/image-gallery";
import { RequestPriceForm, RequestBookingForm } from "@/components/public/request-form";
import { CalendarWidget } from "@/components/public/calendar-widget";
import { useLocale } from "@/hooks/use-locale";
import { getLocalized } from "@/i18n";

interface VenueData {
  id: number;
  slug: string;
  nameRo: string;
  nameRu: string | null;
  nameEn: string | null;
  descriptionRo: string | null;
  descriptionRu: string | null;
  descriptionEn: string | null;
  address: string | null;
  city: string | null;
  capacityMin: number | null;
  capacityMax: number | null;
  pricePerPerson: number | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  facilities: string[] | null;
  menuUrl: string | null;
  virtualTourUrl: string | null;
  calendarEnabled: boolean;
  ratingAvg: number | null;
  ratingCount: number | null;
  images: Array<{ id: number; url: string; altRo: string | null }>;
  reviews: Array<{
    id: number;
    authorName: string;
    rating: number;
    text: string | null;
    reply: string | null;
    createdAt: Date;
  }>;
}

export function VenueDetailClient({ venue }: { venue: VenueData }) {
  const { locale, t } = useLocale();
  const { isSignedIn, isLoaded } = useUser();
  const name = getLocalized(venue, "name", locale);
  const description = getLocalized(venue, "description", locale);
  // M0a #8 — price gated behind login
  const canSeePrice = isLoaded && isSignedIn;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
      <nav className="mb-6 text-xs text-muted-foreground">
        <Link href="/" className="hover:text-gold">Acasă</Link>
        <span className="mx-2">/</span>
        <Link href="/sali" className="hover:text-gold">{t("nav.venues")}</Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">{name}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h1 className="font-heading text-2xl font-bold md:text-3xl">{name}</h1>

          <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            {venue.city && (
              <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {venue.address || venue.city}</span>
            )}
            {venue.capacityMax && (
              <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {venue.capacityMin}–{venue.capacityMax} {t("common.guests")}</span>
            )}
            {venue.ratingAvg ? (
              <span className="flex items-center gap-1">
                <Star className="h-3.5 w-3.5 fill-gold text-gold" /> {venue.ratingAvg.toFixed(1)}
              </span>
            ) : null}
          </div>

          {/* Gallery */}
          <div className="mt-6">
            <ImageGallery images={(venue.images || []).map((img) => ({ url: img.url, alt: img.altRo }))} />
          </div>

          {/* Description */}
          {description && (
            <div className="mt-6">
              <h2 className="mb-3 font-heading text-lg font-bold">{t("artist.description")}</h2>
              <p className="text-muted-foreground">{description}</p>
            </div>
          )}

          {/* Facilities */}
          {venue.facilities && venue.facilities.length > 0 && (
            <div className="mt-6">
              <h2 className="mb-3 font-heading text-lg font-bold">{t("venue.facilities")}</h2>
              <div className="flex flex-wrap gap-2">
                {venue.facilities.map((f) => (
                  <Badge key={f} variant="secondary" className="gap-1">
                    <Check className="h-3 w-3 text-success" /> {f}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* F-S4 — Meniu digital */}
          {venue.menuUrl && (
            <div className="mt-6">
              <h2 className="mb-3 font-heading text-lg font-bold">Meniu</h2>
              <a
                href={venue.menuUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-gold/30 bg-gold/10 px-4 py-2 text-sm font-medium text-gold hover:bg-gold/20"
              >
                Vezi meniu complet
              </a>
            </div>
          )}

          {/* F-S5 — Virtual tour 360° */}
          {venue.virtualTourUrl && (
            <div className="mt-6">
              <h2 className="mb-3 font-heading text-lg font-bold">Tur virtual 360°</h2>
              <div className="aspect-video overflow-hidden rounded-xl border border-border/40">
                <iframe
                  src={venue.virtualTourUrl}
                  className="h-full w-full"
                  allow="xr-spatial-tracking; fullscreen"
                  title={`Tur virtual — ${name}`}
                />
              </div>
            </div>
          )}

          {/* Reviews */}
          {venue.reviews.length > 0 && (
            <div className="mt-8">
              <h2 className="mb-4 font-heading text-lg font-bold">{t("artist.reviews")} ({venue.reviews.length})</h2>
              <div className="space-y-3">
                {venue.reviews.map((review) => (
                  <div key={review.id} className="rounded-lg border border-border/40 bg-card p-4">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{review.authorName}</span>
                      <div className="flex gap-0.5">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star key={i} className={`h-3 w-3 ${i < review.rating ? "fill-gold text-gold" : "text-muted"}`} />
                        ))}
                      </div>
                    </div>
                    {review.text && <p className="mt-2 text-sm text-muted-foreground">{review.text}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <div className="sticky top-20 space-y-3 rounded-xl border border-border/40 bg-card p-6">
            {venue.pricePerPerson && (
              <div className="text-center">
                {canSeePrice ? (
                  <>
                    <p className="font-accent text-3xl font-semibold text-gold">{venue.pricePerPerson}€</p>
                    <p className="text-sm text-muted-foreground">{t("venue.price_per_person")}</p>
                  </>
                ) : (
                  <a
                    href={`/sign-in?redirect_url=${encodeURIComponent(`/sali/${venue.slug}`)}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gold/30 bg-gold/10 px-3 py-2 text-sm font-medium text-gold/90 hover:text-gold"
                  >
                    <Lock className="h-4 w-4" /> Preț la autentificare
                  </a>
                )}
              </div>
            )}
            <RequestPriceForm venueId={venue.id} />
            <RequestBookingForm venueId={venue.id} />
          </div>

          {/* M6 Intern #1 — calendar gated behind login */}
          {venue.calendarEnabled && (
            canSeePrice ? (
              <CalendarWidget
                entityType="venue"
                entityId={venue.id}
                enabled
              />
            ) : (
              <a
                href={`/sign-in?redirect_url=${encodeURIComponent(`/sali/${venue.slug}`)}`}
                className="flex items-center gap-2 rounded-xl border border-gold/30 bg-gold/5 px-4 py-3 text-sm text-gold/90 hover:bg-gold/10 hover:text-gold"
              >
                <Lock className="h-4 w-4 shrink-0" />
                <span>Calendar disponibil după autentificare</span>
              </a>
            )
          )}
        </div>
      </div>
    </div>
  );
}
