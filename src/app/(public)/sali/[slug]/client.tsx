"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Star, MapPin, Users, Check, Lock, ChevronDown, Clock } from "lucide-react";
import { formatWorkingHours } from "@/components/vendor/working-hours-editor";
import { useUser } from "@clerk/nextjs";
import { Badge } from "@/components/ui/badge";
import { ImageGallery } from "@/components/public/image-gallery";
import { RequestPriceForm, RequestBookingForm } from "@/components/public/request-form";
import { ChatWidget } from "@/components/public/chat-widget";
import { ShareButtons } from "@/components/public/share-buttons";
import { ReviewPhotoUploader } from "@/components/public/review-photo-uploader";
import { useLocale } from "@/hooks/use-locale";
import { getLocalized } from "@/i18n";
import { cn } from "@/lib/utils";
import { trackClick } from "@/lib/analytics/track-click";

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
  menuPdfUrl: string | null;
  virtualTourUrl: string | null;
  lat: number | null;
  lng: number | null;
  calendarEnabled: boolean;
  workingHours: {
    mon: { open: string; close: string } | null;
    tue: { open: string; close: string } | null;
    wed: { open: string; close: string } | null;
    thu: { open: string; close: string } | null;
    fri: { open: string; close: string } | null;
    sat: { open: string; close: string } | null;
    sun: { open: string; close: string } | null;
  } | null;
  ratingAvg: number | null;
  ratingCount: number | null;
  images: Array<{ id: number; url: string; altRo: string | null }>;
  reviews: Array<{
    id: number;
    authorName: string;
    rating: number;
    text: string | null;
    reply: string | null;
    photos: string[] | null;
    createdAt: Date;
  }>;
}

interface MenuCategory {
  id: number;
  nameRo: string;
  icon: string | null;
}
interface MenuItem {
  id: number;
  categoryId: number;
  nameRo: string;
  descriptionRo: string | null;
  priceEur: number | null;
}
interface MenuPackage {
  id: number;
  nameRo: string;
  pricePerPerson: number;
  currency: string | null;
  includes: string | null;
  excludes: string | null;
  minGuests: number | null;
  isRecommended: boolean;
}

export function VenueDetailClient({
  venue,
  menu,
}: {
  venue: VenueData;
  menu?: {
    categories: MenuCategory[];
    items: MenuItem[];
    packages: MenuPackage[];
  };
}) {
  const { locale, t } = useLocale();
  const { isSignedIn, isLoaded } = useUser();
  const name = getLocalized(venue, "name", locale);
  const description = getLocalized(venue, "description", locale);
  // M0a #8 — price gated behind login
  const canSeePrice = isLoaded && isSignedIn;

  useEffect(() => {
    import("@/hooks/use-recently-viewed").then(({ trackRecentView }) => {
      trackRecentView("venue", {
        slug: venue.slug,
        name,
        imageUrl: venue.images?.[0]?.url ?? null,
      });
    });
  }, [venue.slug, venue.images, name]);

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
            {venue.workingHours && (
              <span className="flex items-center gap-1" title="Program funcționare">
                <Clock className="h-3.5 w-3.5" />
                {formatWorkingHours(venue.workingHours)}
              </span>
            )}
          </div>

          {/* Gallery — fires a single "gallery" beacon when the user first
              interacts with any thumbnail (debounced in the endpoint via
              session dedupe). */}
          <div
            className="mt-6"
            onClickCapture={() => trackClick("venue", venue.id, "gallery")}
          >
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

          {/* G-70 — Google Maps embed */}
          {venue.lat && venue.lng && (
            <div className="mt-6">
              <h2 className="mb-3 font-heading text-lg font-bold">Locație</h2>
              <div className="aspect-video overflow-hidden rounded-xl border border-border/40">
                <iframe
                  src={`https://www.google.com/maps/embed?pb=!1m14!1m12!1m3!1d2000!2d${venue.lng}!3d${venue.lat}!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!5e0!3m2!1sro!2smd`}
                  className="h-full w-full"
                  style={{ border: 0 }}
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  title={`Locație — ${name}`}
                />
              </div>
              {venue.address && (
                <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 text-gold" /> {venue.address}, {venue.city}
                </p>
              )}
            </div>
          )}

          {/* F-S4 — Meniu digital (spec section 5) */}
          {(menu?.packages.length || menu?.categories.length || venue.menuUrl || venue.menuPdfUrl) ? (
            <div className="mt-6">
              <h2 className="mb-3 font-heading text-lg font-bold">Meniu</h2>

              {/* Packages */}
              {menu && menu.packages.length > 0 && (
                <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {menu.packages.map((p) => (
                    <div
                      key={p.id}
                      className={cn(
                        "relative rounded-xl border bg-card p-5",
                        p.isRecommended
                          ? "border-gold ring-2 ring-gold/30"
                          : "border-border/40",
                      )}
                    >
                      {p.isRecommended && (
                        <div className="absolute -top-2 right-4 rounded-full bg-gold px-3 py-0.5 text-[10px] font-bold text-[#0D0D0D]">
                          RECOMANDAT
                        </div>
                      )}
                      <h3 className="font-heading text-lg font-bold">
                        {p.nameRo}
                      </h3>
                      <div className="mt-2 flex items-baseline gap-1">
                        <span className="font-accent text-3xl font-bold text-gold">
                          {p.pricePerPerson}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {p.currency || "EUR"} / persoană
                        </span>
                      </div>
                      {p.minGuests && (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Min. {p.minGuests} persoane
                        </p>
                      )}
                      {p.includes && (
                        <div className="mt-3">
                          <p className="text-[10px] font-medium uppercase tracking-wider text-emerald-500">
                            Include
                          </p>
                          <p className="mt-0.5 whitespace-pre-wrap text-xs">
                            {p.includes}
                          </p>
                        </div>
                      )}
                      {p.excludes && (
                        <div className="mt-2">
                          <p className="text-[10px] font-medium uppercase tracking-wider text-red-400">
                            Nu include
                          </p>
                          <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground">
                            {p.excludes}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Categories + Items accordion */}
              {menu && menu.categories.length > 0 && (
                <div
                  className="mb-4 space-y-2"
                  onClickCapture={() => trackClick("venue", venue.id, "menu")}
                >
                  {menu.categories.map((c) => (
                    <CategoryAccordion
                      key={c.id}
                      category={c}
                      items={menu.items.filter((i) => i.categoryId === c.id)}
                    />
                  ))}
                </div>
              )}

              {/* External website link + uploaded PDF download — separate buttons
                * because they do different things: menuUrl opens the venue's
                * own menu page on their site, menuPdfUrl downloads the PDF the
                * owner uploaded to our R2 bucket. */}
              {(venue.menuPdfUrl || venue.menuUrl) && (
                <div className="flex flex-wrap gap-2">
                  {venue.menuUrl && (
                    <a
                      href={venue.menuUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => trackClick("venue", venue.id, "menu")}
                      className="inline-flex items-center gap-2 rounded-lg border border-gold/30 bg-gold/5 px-4 py-2 text-sm font-medium text-gold hover:bg-gold/15"
                    >
                      Vezi meniul pe site
                    </a>
                  )}
                  {venue.menuPdfUrl && (
                    <a
                      href={venue.menuPdfUrl}
                      // `download` attribute hints the browser to save the
                      // file rather than navigate. Same-origin (Vercel Blob /
                      // R2 with proper headers) honors it; cross-origin hosts
                      // may still open inline, but the link still triggers a
                      // download dialog if the response uses
                      // Content-Disposition: attachment.
                      download
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => trackClick("venue", venue.id, "menu")}
                      className="inline-flex items-center gap-2 rounded-lg border border-gold/30 bg-gold/10 px-4 py-2 text-sm font-medium text-gold hover:bg-gold/20"
                    >
                      Descarcă meniu PDF
                    </a>
                  )}
                </div>
              )}
            </div>
          ) : null}

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
                    {review.photos && review.photos.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {review.photos.map((url, i) => (
                          <a
                            key={url}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block h-20 w-20 overflow-hidden rounded-lg border border-border/40 transition-transform hover:scale-105"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={url}
                              alt={`Fotografie recenzie ${i + 1}`}
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Review form */}
          <div className="mt-8">
            <VenueReviewForm venueId={venue.id} />
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <div className="space-y-3 rounded-xl border border-border/40 bg-card p-6 lg:sticky lg:top-20">
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
            <RequestBookingForm venueId={venue.id} capacityMax={venue.capacityMax} />
            <ChatWidget
              venueId={venue.id}
              artistName={getLocalized(venue, "name", locale) || venue.nameRo}
              artistSlug={venue.slug}
              slugPrefix="sali"
            />

            {/* Share buttons */}
            <div className="rounded-xl border border-border/40 bg-card p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Partajează
              </p>
              <ShareButtons
                title={`${name} — sală evenimente pe ePetrecere.md`}
                compact
              />
            </div>
          </div>

          {/* Calendar removed from public profile — see comment on
              /artisti/[slug]/client.tsx. Availability lives behind the
              event-plan booking flow now. */}
        </div>
      </div>
    </div>
  );
}

function CategoryAccordion({
  category,
  items,
}: {
  category: MenuCategory;
  items: MenuItem[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-xl border border-border/40">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-3 bg-card px-4 py-3 text-left hover:bg-accent/30"
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          {category.nameRo}
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
            {items.length}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && items.length > 0 && (
        <ul className="divide-y divide-border/20 bg-background/50">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-start justify-between gap-3 px-4 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{item.nameRo}</p>
                {item.descriptionRo && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {item.descriptionRo}
                  </p>
                )}
              </div>
              {item.priceEur !== null && (
                <span className="shrink-0 font-medium text-gold">
                  {item.priceEur}€
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function VenueReviewForm({ venueId }: { venueId: number }) {
  const [rating, setRating] = useState(5);
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [eventType, setEventType] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || text.length < 10) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venueId,
          authorName: name,
          rating,
          text,
          eventType: eventType || undefined,
          photos,
        }),
      });
      if (!res.ok) throw new Error();
      setSubmitted(true);
    } catch {
      // silent
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="rounded-xl border border-success/30 bg-success/10 p-6 text-center">
        <p className="font-heading font-bold text-success">
          Mulțumim pentru recenzie!
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Recenzia va fi publicată după verificare.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-border/40 bg-card p-5"
    >
      <h3 className="mb-4 font-heading text-base font-bold">Lasă o recenzie</h3>
      <div className="mb-4 flex gap-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <button key={i} type="button" onClick={() => setRating(i + 1)}>
            <Star
              className={cn(
                "h-6 w-6 cursor-pointer transition-colors",
                i < rating
                  ? "fill-gold text-gold"
                  : "text-muted hover:text-gold/50",
              )}
            />
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Numele tău *"
          required
          className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <select
          value={eventType}
          onChange={(e) => setEventType(e.target.value)}
          className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">Tip eveniment</option>
          <option value="Nuntă">Nuntă</option>
          <option value="Botez">Botez</option>
          <option value="Corporate">Corporate</option>
          <option value="Aniversare">Aniversare</option>
        </select>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Scrie recenzia ta (min 10 caractere) *"
        required
        minLength={10}
        rows={3}
        className="mt-3 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />

      {/* Photos */}
      <div className="mt-3">
        <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Fotografii (opțional)
        </p>
        <ReviewPhotoUploader value={photos} onChange={setPhotos} max={5} />
      </div>

      <button
        type="submit"
        disabled={submitting || !name || text.length < 10}
        className="mt-3 inline-flex items-center gap-2 rounded-md bg-gold px-6 py-2 text-sm font-medium text-[#0D0D0D] hover:bg-gold-dark disabled:opacity-50"
      >
        {submitting ? "Se trimite..." : "Trimite recenzia"}
      </button>
    </form>
  );
}
