"use client";

import { useEffect, useState } from "react";
import Link from "@/components/shared/locale-link";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  Clock,
  Lock,
  MapPin,
  Sparkles,
  Star,
  Users,
  Utensils,
} from "lucide-react";
import { formatWorkingHours } from "@/components/vendor/working-hours-editor";
import { useUser } from "@clerk/nextjs";
import { Badge } from "@/components/ui/badge";
import { RequestPriceForm } from "@/components/public/request-form";
import { AddToEventButton } from "@/components/public/add-to-event-button";
import { ChatWidget } from "@/components/public/chat-widget";
import { WishlistButton } from "@/components/public/wishlist-button";
import { ShareButtons } from "@/components/public/share-buttons";
import { VenueCard } from "@/components/public/venue-card";
import { useLocale } from "@/hooks/use-locale";
import { getLocalized } from "@/i18n";
import { cn } from "@/lib/utils";
import { trackClick } from "@/lib/analytics/track-click";
import { plural, NOUNS } from "@/lib/i18n/plural";
import { formatPrice, currencySymbol } from "@/lib/format/price";
import { useGatedDetails } from "@/hooks/use-gated-details";

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

/** Shown only when the owner listed no facilities of their own. */
const DEFAULT_FACILITY_KEYS = [
  "venue.detail.facilityParking",
  "venue.detail.facilityCeremony",
  "venue.detail.facilityStage",
  "venue.detail.facilityMenu",
  "venue.detail.facilityAc",
  "venue.detail.facilityWifi",
];

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
  similar = [],
}: {
  venue: VenueData;
  menu?: {
    categories: MenuCategory[];
    items: MenuItem[];
    packages: MenuPackage[];
  };
  similar?: Array<{
    id: number;
    slug: string;
    nameRo: string;
    nameRu: string | null;
    nameEn: string | null;
    address: string | null;
    city: string | null;
    capacityMin: number | null;
    capacityMax: number | null;
    pricePerPerson: number | null;
    ratingAvg: number | null;
    ratingCount: number | null;
    isFeatured: boolean;
    coverImageUrl?: string | null;
  }>;
}) {
  const { locale, t } = useLocale();
  const { isSignedIn, isLoaded } = useUser();
  const searchParams = useSearchParams();
  const name = getLocalized(venue, "name", locale);
  const description = getLocalized(venue, "description", locale);
  // M0a #8 — price gated behind login
  const canSeePrice = isLoaded && isSignedIn;

  // Prerendered anonymously — the price and the venue's website arrive from
  // the authenticated endpoint once Clerk confirms a session.
  const gated = useGatedDetails<{
    pricePerPerson: number | null;
    website: string | null;
  }>("venue", venue.slug);
  const shown = gated ? { ...venue, ...gated } : venue;
  const venueFallbackImages = [
    "/images/redesign/venue-chateau-hero.webp",
    "/images/venues/hall-1.jpg",
    "/images/venues/hall-2.jpg",
    "/images/venues/hall-3.jpg",
    "/images/venues/hall-4.jpg",
    "/images/venues/hall-5.jpg",
    "/images/venues/hall-6.jpg",
  ];
  const realImages = Array.from(
    new Set(venue.images.map((image) => image.url).filter(Boolean)),
  );
  const venueHeroImage =
    venue.slug === "chateau-vartely-events"
      ? "/images/redesign/venue-chateau-hero.webp"
      : realImages[0] ||
        venueFallbackImages[venue.id % venueFallbackImages.length];
  // A gallery must represent this venue, not silently borrow stock photos
  // used by other listings. When the owner uploaded one photo, show one.
  const galleryImages = realImages
    .filter((url) => url !== venueHeroImage)
    .slice(0, 4);
  const planParam = Number(searchParams.get("plan"));
  const eventPlanId = Number.isFinite(planParam) && planParam > 0
    ? planParam
    : null;

  useEffect(() => {
    import("@/hooks/use-recently-viewed").then(({ trackRecentView }) => {
      trackRecentView("venue", {
        slug: venue.slug,
        name,
        imageUrl: venueHeroImage,
      });
    });
  }, [venue.slug, name, venueHeroImage]);

  return (
    <div className="-mt-16 min-h-screen bg-[#05080d] pt-16 text-[#f5efe4]">
    <div className="mx-auto max-w-[1480px] px-4 py-8 lg:px-8">
      <nav className="mb-7 text-xs text-white/42">
        <Link href="/" className="hover:text-gold">{t("nav.home")}</Link>
        <span className="mx-2">/</span>
        <Link href="/sali" className="hover:text-gold">{t("nav.venues")}</Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">{name}</span>
      </nav>

      <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-start gap-3">
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[.28em] text-[#e6b84d]">
                {t("venue.detail.eyebrow")}
              </p>
              <h1 className="font-heading text-3xl font-semibold tracking-tight text-[#fbf7ee] md:text-5xl">{name}</h1>
            </div>
            <div className="ml-auto">
              <WishlistButton entityName={name} entityType="venue" entityId={venue.id} />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-white/58">
            <Badge className="gap-1 border border-[#e6b84d]/30 bg-[#e6b84d]/10 text-[#ebc765]">
              <Sparkles className="h-3 w-3" /> {t("venue.detail.verified")}
            </Badge>
            {venue.city && (
              <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {venue.address || venue.city}</span>
            )}
            {venue.capacityMax && (
              <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {venue.capacityMin}–{venue.capacityMax} {t("common.guests")}</span>
            )}
            <span className="flex items-center gap-1">
              <Star className="h-3.5 w-3.5 fill-gold text-gold" />
              {venue.ratingAvg && venue.ratingAvg > 0 ? venue.ratingAvg.toFixed(1) : t("venue.detail.new")}
              {venue.ratingCount ? <span className="text-white/36">({plural(venue.ratingCount, locale, NOUNS.reviews)})</span> : null}
            </span>
            {venue.workingHours && (
              <span className="flex items-center gap-1" title={t("venue.detail.workingHours")}>
                <Clock className="h-3.5 w-3.5" />
                {formatWorkingHours(venue.workingHours)}
              </span>
            )}
          </div>

          {/* Gallery — fires a single "gallery" beacon when the user first
              interacts with any thumbnail (debounced in the endpoint via
              session dedupe). */}
          <div
            className="mt-7 grid gap-2"
            onClickCapture={() => trackClick("venue", venue.id, "gallery")}
          >
            <a
              href={venueHeroImage}
              target="_blank"
              rel="noreferrer"
              className="group relative block aspect-[16/7] overflow-hidden rounded-2xl border border-[#e6b84d]/35"
            >
              <img
                src={venueHeroImage}
                alt={t("venue.detail.heroAlt", { name })}
                className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.02]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
              <span className="absolute bottom-4 left-4 rounded-lg border border-white/20 bg-black/46 px-4 py-2 text-xs font-medium text-white backdrop-blur">
                {t("venue.detail.viewGallery", {
                  count: Math.max(venue.images.length, galleryImages.length + 1),
                })}
              </span>
            </a>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {galleryImages.map((image, index) => (
                  <a
                    key={image}
                    href={image}
                    target="_blank"
                    rel="noreferrer"
                    className="group relative aspect-[16/9] overflow-hidden rounded-lg border border-white/10"
                  >
                    <img
                      src={image}
                      alt={t("venue.detail.galleryAlt", { name, index: index + 1 })}
                      className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                      loading="lazy"
                    />
                    {index === 3 && venue.images.length > 4 && (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/55 font-heading text-xl text-white">
                        +{venue.images.length - 4}
                      </span>
                    )}
                  </a>
                ))}
              </div>
          </div>

          <nav className="mt-7 flex gap-1 overflow-x-auto rounded-xl border border-white/8 bg-[#0c111b] p-1 text-xs">
            {[
              ["#despre", t("venue.detail.tabAbout")],
              ["#facilitati", t("venue.facilities")],
              ["#pachete", t("venue.detail.tabPackages")],
              ["#recenzii", t("venue.detail.tabReviews", { count: venue.reviews.length })],
              ["#locatie", t("venue.detail.tabLocation")],
            ].map(([href, label]) => (
              <a key={href} href={href} className="shrink-0 rounded-lg px-4 py-2.5 text-white/56 hover:bg-[#e6b84d]/10 hover:text-[#e6b84d]">
                {label}
              </a>
            ))}
          </nav>

          {/* Description */}
          <section id="despre" className="mt-8 scroll-mt-24">
            <h2 className="font-heading text-2xl font-semibold text-[#fbf7ee]">{t("venue.detail.tabAbout")}</h2>
            <div className="mt-4 grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
              <div className="rounded-xl border border-white/8 bg-white/[.025] p-5">
                <p className="text-sm leading-7 text-white/62">
                  {description || t("venue.detail.descriptionFallback", { name })}
                </p>
              </div>
              <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-white/8 bg-[#0d1119]">
                <VenueFact
                  icon={Users}
                  label={t("venue.capacity")}
                  value={
                    venue.capacityMax
                      ? `${venue.capacityMin || 1}–${venue.capacityMax} ${t("common.guests")}`
                      : t("venue.detail.onRequest")
                  }
                />
                <VenueFact icon={MapPin} label={t("venue.detail.factLocality")} value={venue.city || t("venue.detail.moldova")} />
                <VenueFact
                  icon={Clock}
                  label={t("venue.detail.factSchedule")}
                  value={venue.workingHours ? formatWorkingHours(venue.workingHours) : t("venue.detail.flexible")}
                />
                <VenueFact icon={Building2} label={t("venue.detail.factSpaceType")} value={t("venue.detail.eventHall")} />
              </div>
            </div>
          </section>

          {/* Facilities */}
          <section id="facilitati" className="mt-8 scroll-mt-24">
              <h2 className="mb-4 font-heading text-2xl font-semibold">{t("venue.facilities")}</h2>
              <div className="flex flex-wrap gap-2">
                {(venue.facilities?.length
                  ? venue.facilities
                  : DEFAULT_FACILITY_KEYS.map((key) => t(key))
                ).map((f) => (
                  <Badge key={f} variant="secondary" className="gap-1 border border-[#e6b84d]/20 bg-[#e6b84d]/7 text-white/68">
                    <Check className="h-3 w-3 text-[#e6b84d]" /> {f}
                  </Badge>
                ))}
              </div>
          </section>

          {/* G-70 — Google Maps embed */}
          {venue.lat && venue.lng && (
            <section id="locatie" className="mt-8 scroll-mt-24">
              <h2 className="mb-4 font-heading text-2xl font-semibold">{t("venue.location")}</h2>
              <div className="aspect-video overflow-hidden rounded-xl border border-border/40">
                <iframe
                  src={`https://www.google.com/maps/embed?pb=!1m14!1m12!1m3!1d2000!2d${venue.lng}!3d${venue.lat}!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!5e0!3m2!1sro!2smd`}
                  className="h-full w-full"
                  style={{ border: 0 }}
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  title={t("venue.detail.mapTitle", { name })}
                />
              </div>
              {venue.address && (
                <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 text-gold" /> {venue.address}, {venue.city}
                </p>
              )}
            </section>
          )}

          {/* F-S4 — Meniu digital (spec section 5) */}
          <section id="pachete" className="mt-10 scroll-mt-24">
              <p className="text-[10px] font-semibold uppercase tracking-[.24em] text-[#e6b84d]">{t("venue.detail.packagesEyebrow")}</p>
              <h2 className="mt-2 mb-5 font-heading text-2xl font-semibold">{t("venue.detail.packagesTitle")}</h2>

              {/* Packages */}
              {menu && menu.packages.length > 0 ? (
                <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {menu.packages.map((p) => (
                    <div
                      key={p.id}
                      className={cn(
                        "relative rounded-xl border bg-[linear-gradient(180deg,#111722,#0b1018)] p-5",
                        p.isRecommended
                          ? "border-gold ring-2 ring-gold/30"
                          : "border-white/10",
                      )}
                    >
                      {p.isRecommended && (
                        <div className="absolute -top-2 right-4 rounded-full bg-gold px-3 py-0.5 text-[10px] font-bold text-[#0D0D0D]">
                          {t("venue.detail.recommended")}
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
                          {currencySymbol(p.currency)} / {t("venue.detail.perPerson")}
                        </span>
                      </div>
                      {p.minGuests && (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {t("venue.detail.minGuests", { count: p.minGuests })}
                        </p>
                      )}
                      {p.includes && (
                        <div className="mt-3">
                          <p className="text-[10px] font-medium uppercase tracking-wider text-emerald-500">
                            {t("venue.detail.included")}
                          </p>
                          <p className="mt-0.5 whitespace-pre-wrap text-xs">
                            {p.includes}
                          </p>
                        </div>
                      )}
                      {p.excludes && (
                        <div className="mt-2">
                          <p className="text-[10px] font-medium uppercase tracking-wider text-red-400">
                            {t("venue.detail.notIncluded")}
                          </p>
                          <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground">
                            {p.excludes}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <GenericVenuePackages />
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
                      {t("venue.detail.menuOnSite")}
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
                      {t("venue.detail.menuPdf")}
                    </a>
                  )}
                </div>
              )}
          </section>

          {/* F-S5 — Virtual tour 360° */}
          {venue.virtualTourUrl && (
            <div className="mt-6">
              <h2 className="mb-3 font-heading text-lg font-bold">{t("venue.detail.virtualTour")}</h2>
              <div className="aspect-video overflow-hidden rounded-xl border border-border/40">
                <iframe
                  src={venue.virtualTourUrl}
                  className="h-full w-full"
                  allow="xr-spatial-tracking; fullscreen"
                  title={t("venue.detail.virtualTourTitle", { name })}
                />
              </div>
            </div>
          )}

          {/* Reviews */}
          <section id="recenzii" className="mt-10 scroll-mt-24">
              <p className="text-[10px] font-semibold uppercase tracking-[.24em] text-[#e6b84d]">{t("venue.detail.reviewsEyebrow")}</p>
              <h2 className="mt-2 mb-5 font-heading text-2xl font-semibold">{t("artist.reviews")} ({venue.reviews.length})</h2>
              {venue.reviews.length > 0 ? (
              <div className="grid gap-3 md:grid-cols-2">
                {venue.reviews.map((review) => (
                  <div key={review.id} className="rounded-xl border border-white/8 bg-[#0d1119] p-5">
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
                            { }
                            <img
                              src={url}
                              alt={t("venue.detail.reviewPhotoAlt", { index: i + 1 })}
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
              ) : (
                <p className="rounded-xl border border-white/8 bg-white/[.02] p-5 text-sm text-white/48">
                  {t("venue.detail.noReviews")}
                </p>
              )}

          {/* Review form */}
          <div className="mt-5">
            <VenueReviewForm />
          </div>
          </section>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <div className="space-y-3 rounded-2xl border border-[#e6b84d]/55 bg-[linear-gradient(180deg,#161922,#0b1017)] p-5 shadow-[0_24px_60px_rgba(0,0,0,.34)] lg:sticky lg:top-20">
            <div className="border-b border-white/8 pb-4">
              <p className="text-[10px] font-semibold uppercase tracking-[.22em] text-[#e6b84d]">{t("venue.detail.bookEyebrow")}</p>
              <h2 className="mt-2 font-heading text-xl font-semibold text-[#fbf7ee]">
                {t("venue.detail.bookTitle", { name })}
              </h2>
              <div className="mt-3 flex items-center gap-2 text-xs text-white/48">
                <CalendarDays className="h-3.5 w-3.5 text-[#e6b84d]" />
                {t("venue.detail.bookHint")}
              </div>
            </div>
            <div className="py-1 text-center">
              {shown.pricePerPerson ? (
                canSeePrice ? (
                  <>
                    <p className="font-accent text-3xl font-semibold text-gold">{formatPrice(shown.pricePerPerson, null, locale)}</p>
                    <p className="text-sm text-muted-foreground">{t("venue.price_per_person")}</p>
                  </>
                ) : (
                  <a
                    href={`/sign-in?redirect_url=${encodeURIComponent(`/sali/${venue.slug}`)}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gold/30 bg-gold/10 px-3 py-2 text-sm font-medium text-gold/90 hover:text-gold"
                  >
                    <Lock className="h-4 w-4" /> {t("venue.detail.priceOnLogin")}
                  </a>
                )
              ) : !canSeePrice ? (
                <a
                  href={`/sign-in?redirect_url=${encodeURIComponent(`/sali/${venue.slug}`)}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gold/30 bg-gold/10 px-3 py-2 text-sm font-medium text-gold/90 hover:text-gold"
                >
                  <Lock className="h-4 w-4" /> {t("venue.detail.priceOnLogin")}
                </a>
              ) : (
                <p className="text-sm text-white/54">{t("venue.detail.customOffer")}</p>
              )}
            </div>
            <RequestPriceForm venueId={venue.id} />
            <AddToEventButton
              venueId={venue.id}
              venueSlug={venue.slug}
              presetEventPlanId={eventPlanId}
            />
            <ChatWidget
              venueId={venue.id}
              artistName={getLocalized(venue, "name", locale) || venue.nameRo}
              artistSlug={venue.slug}
              slugPrefix="sali"
            />

            {/* Share buttons */}
            <div className="rounded-xl border border-border/40 bg-card p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("venue.detail.share")}
              </p>
              <ShareButtons
                title={t("venue.detail.shareTitle", { name })}
                compact
              />
            </div>
          </div>

          {/* Calendar removed from public profile — see comment on
              /artisti/[slug]/client.tsx. Availability lives behind the
              event-plan booking flow now. */}
        </div>
      </div>
      {similar.length > 0 && (
        <section className="mt-16 border-t border-white/8 pt-10">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[.24em] text-[#e6b84d]">{t("venue.detail.moreEyebrow")}</p>
              <h2 className="mt-2 font-heading text-2xl font-semibold">{t("venue.detail.similar")}</h2>
            </div>
            <Link href="/sali" className="inline-flex items-center gap-2 text-xs font-semibold text-[#e6b84d] hover:text-[#f1d684]">
              {t("venue.detail.allVenues")} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {similar.map((item, index) => <VenueCard key={item.id} venue={item} imageIndex={index + 2} />)}
          </div>
        </section>
      )}
    </div>
    </div>
  );
}

function VenueFact({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users;
  label: string;
  value: string;
}) {
  return (
    <div className="border-b border-r border-white/8 p-4">
      <Icon className="h-4 w-4 text-[#e6b84d]" />
      <p className="mt-3 text-[10px] uppercase tracking-wider text-white/34">{label}</p>
      <p className="mt-1 text-xs font-medium text-white/75">{value}</p>
    </div>
  );
}

function GenericVenuePackages() {
  const { t } = useLocale();
  const packages = [
    {
      name: "Elegant",
      icon: Utensils,
      descriptionKey: "venue.detail.genericElegant",
    },
    {
      name: "Signature",
      icon: Sparkles,
      descriptionKey: "venue.detail.genericSignature",
    },
    {
      name: "Corporate",
      icon: Building2,
      descriptionKey: "venue.detail.genericCorporate",
    },
  ];
  return (
    <div className="mb-4 grid gap-3 md:grid-cols-3">
      {packages.map((item, index) => (
        <article
          key={item.name}
          className={cn(
            "rounded-xl border bg-[linear-gradient(180deg,#111722,#0b1018)] p-5",
            index === 1 ? "border-[#e6b84d]/55 shadow-[0_12px_30px_rgba(230,184,77,.08)]" : "border-white/10",
          )}
        >
          <item.icon className="h-5 w-5 text-[#e6b84d]" />
          <h3 className="mt-4 font-heading text-lg font-semibold">{item.name}</h3>
          <p className="mt-2 text-xs leading-5 text-white/48">{t(item.descriptionKey)}</p>
          <p className="mt-5 text-sm font-semibold text-[#e6b84d]">{t("venue.detail.priceOnRequest")}</p>
        </article>
      ))}
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

function VenueReviewForm() {
  const { t } = useLocale();
  return (
    <div className="rounded-xl border border-border/40 bg-card p-5">
      <h3 className="font-heading text-base font-bold">{t("venue.detail.verifiedReviews")}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {t("venue.detail.verifiedReviewsHint")}
      </p>
      <Link
        href="/cabinet/recenzii"
        className="mt-4 inline-flex items-center gap-2 rounded-md bg-gold px-5 py-2.5 text-sm font-semibold text-[#0D0D0D] hover:bg-gold-dark"
      >
        {t("venue.detail.eligibleBookings")} <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
