"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  Camera,
  Check,
  Clock3,
  Crown,
  Globe,
  Languages,
  Lock,
  MapPin,
  Mic2,
  Sparkles,
  Star,
  X,
  ZoomIn,
} from "lucide-react";
import { useUser } from "@clerk/nextjs";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArtistCard } from "@/components/public/artist-card";
import { ImageGallery } from "@/components/public/image-gallery";
import { RequestPriceForm } from "@/components/public/request-form";
import { WishlistButton } from "@/components/public/wishlist-button";
import { resolveArtistCoverImage } from "@/lib/artists/demo-images";
import { AddToEventButton } from "@/components/public/add-to-event-button";
import { ChatWidget } from "@/components/public/chat-widget";
import { ShareButtons } from "@/components/public/share-buttons";
import { trackClick } from "@/lib/analytics/track-click";
import { useLocale } from "@/hooks/use-locale";
import { getLocalized } from "@/i18n";

interface ArtistData {
  id: number;
  slug: string;
  nameRo: string;
  nameRu: string | null;
  nameEn: string | null;
  descriptionRo: string | null;
  descriptionRu: string | null;
  descriptionEn: string | null;
  priceFrom: number | null;
  priceHidden?: boolean | null;
  priceCurrency: string | null;
  location: string | null;
  phone: string | null;
  website: string | null;
  instagram: string | null;
  ratingAvg: number | null;
  ratingCount: number | null;
  isVerified: boolean;
  isFeatured: boolean;
  isPremium: boolean;
  calendarEnabled: boolean;
  photoUrl: string | null;
  images: Array<{ id: number; url: string; altRo: string | null; isCover: boolean }>;
  videos: Array<{ id: number; platform: string; videoId: string; title: string | null }>;
  packages: Array<{
    id: number;
    nameRo: string;
    nameRu: string | null;
    nameEn: string | null;
    descriptionRo: string | null;
    descriptionRu: string | null;
    descriptionEn: string | null;
    price: number | null;
    durationHours: number | null;
  }>;
  reviews: Array<{
    id: number;
    authorName: string;
    rating: number;
    text: string | null;
    eventType: string | null;
    reply: string | null;
    photos: string[] | null;
    createdAt: Date;
  }>;
}

interface UgcPhoto {
  id: number;
  url: string;
  caption: string | null;
}

interface Props {
  artist: ArtistData;
  ugcPhotos?: UgcPhoto[];
  similar: Array<{
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
  }>;
}

export function ArtistDetailClient({ artist, similar, ugcPhotos = [] }: Props) {
  const { locale, t } = useLocale();
  const { isSignedIn, isLoaded } = useUser();
  const searchParams = useSearchParams();
  const name = getLocalized(artist, "name", locale);
  const description = getLocalized(artist, "description", locale);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const profilePhotoUrl = resolveArtistCoverImage(
    artist.slug,
    artist.photoUrl,
    artist.images?.[0]?.url,
  );
  const galleryImages = artist.images.filter(
    (image) =>
      !image.url.toLowerCase().includes("placeholder") &&
      image.url !== profilePhotoUrl,
  );
  const momentImages = Array.from(
    new Set([
      ...(profilePhotoUrl ? [profilePhotoUrl] : []),
      ...galleryImages.map((image) => image.url),
      ...ugcPhotos.map((image) => image.url),
    ]),
  )
    .filter(Boolean)
    .slice(0, 6);
  const profilePackages = artist.packages.length
    ? artist.packages.map((pkg) => ({
        id: pkg.id,
        name: getLocalized(pkg, "name", locale),
        description: getLocalized(pkg, "description", locale),
        price: pkg.price,
        durationHours: pkg.durationHours,
        isReal: true,
      }))
    : [
        {
          id: -1,
          name: "Essential",
          description: "Program artistic personalizat pentru momentele principale ale evenimentului.",
          price: null,
          durationHours: 2,
          isReal: false,
        },
        {
          id: -2,
          name: "Signature",
          description: "Show complet, repertoriu adaptat invitaților și coordonare cu echipa tehnică.",
          price: null,
          durationHours: 4,
          isReal: false,
        },
        {
          id: -3,
          name: "Full Event",
          description: "Prezență extinsă și program construit în jurul întregului eveniment.",
          price: null,
          durationHours: 6,
          isReal: false,
        },
      ];

  // Track recent views so the homepage/cabinet "Recently viewed" widget has data
  useEffect(() => {
    import("@/hooks/use-recently-viewed").then(({ trackRecentView }) => {
      trackRecentView("artist", {
        slug: artist.slug,
        name,
        imageUrl: profilePhotoUrl,
      });
    });
  }, [artist.slug, name, profilePhotoUrl]);

  // Resolve the event plan this booking should attach to. Priority order:
  // explicit `?plan=X` URL param (used by dashboard discovery links) →
  // sessionStorage.wizard-plan-id (set by /planifica/rezultate after the
  // wizard flow creates a plan) → null (anonymous / no plan; falls back
  // to /api/leads in the form).
  const [eventPlanId, setEventPlanId] = useState<number | undefined>(undefined);
  useEffect(() => {
    const fromUrl = searchParams.get("plan");
    if (fromUrl && !Number.isNaN(Number(fromUrl))) {
      setEventPlanId(Number(fromUrl));
      return;
    }
    const fromSession = typeof window !== "undefined"
      ? sessionStorage.getItem("wizard-plan-id")
      : null;
    if (fromSession) setEventPlanId(Number(fromSession));
  }, [searchParams]);
  // M0a #8 — contact info and price are gated behind login. We wait for Clerk
  // to hydrate so we don't flash a "Lock" state for authenticated visitors.
  const canSeeContact = isLoaded && isSignedIn;

  return (
    <div className="-mt-16 min-h-screen bg-[#05080d] pt-16 text-[#f5efe4]">
    <div className="mx-auto max-w-[1480px] px-4 py-8 lg:px-8">
      {/* Breadcrumb */}
      <nav className="mb-7 text-xs text-white/42">
        <Link href="/" className="hover:text-gold">Acasă</Link>
        <span className="mx-2">/</span>
        <Link href="/artisti" className="hover:text-gold">{t("nav.artists")}</Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">{name}</span>
      </nav>

      <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Main Content */}
        <div>
          {/* Profile Header */}
          <div className="mb-7 grid gap-6 sm:grid-cols-[300px_minmax(0,1fr)]">
            <button
              type="button"
              onClick={() => profilePhotoUrl && setAvatarOpen(true)}
              disabled={!profilePhotoUrl}
              className="group relative flex aspect-[4/5] w-full shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[#e6b84d]/55 bg-[#11151d] shadow-[0_18px_48px_rgba(0,0,0,.35)] transition-all hover:shadow-[0_18px_50px_rgba(201,168,76,.2)] disabled:cursor-default"
              aria-label={`Vezi poza mare a lui ${name}`}
            >
              {profilePhotoUrl ? (
                <>
                  <img
                    src={profilePhotoUrl}
                    alt={name}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover:bg-black/40 group-hover:opacity-100">
                    <ZoomIn className="h-6 w-6 text-white" />
                  </div>
                </>
              ) : (
                <span className="text-3xl">🎵</span>
              )}
            </button>
            <div className="flex-1">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[.28em] text-[#e6b84d]">
                Artist pentru evenimente
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-heading text-3xl font-semibold tracking-tight text-[#fbf7ee] md:text-5xl">{name}</h1>
                {artist.isVerified && (
                  <Badge className="bg-gold/10 text-gold border-gold/30 gap-1">
                    <BadgeCheck className="h-3 w-3" /> Verificat
                  </Badge>
                )}
                {artist.isPremium && (
                  <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/30 gap-1">
                    <Crown className="h-3 w-3" /> Premium
                  </Badge>
                )}
                {/* Wishlist back on the public artist page — got dropped
                    when the booking CTA was rewired to the event-plan
                    flow. Heart toggle on the right of the title row;
                    persists per signed-in user via /api/wishlist. */}
                <div className="ml-auto">
                  <WishlistButton entityType="artist" entityId={artist.id} />
                </div>
              </div>

              <p className="mt-3 text-base font-medium text-[#e6b84d]">
                Muzică live • show premium • program personalizat
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-white/58">
                {artist.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" /> {artist.location}
                  </span>
                )}
                {artist.ratingAvg ? (
                  <span className="flex items-center gap-1">
                    <Star className="h-3.5 w-3.5 fill-gold text-gold" />
                    {artist.ratingAvg.toFixed(1)} ({artist.ratingCount} recenzii)
                  </span>
                ) : null}
                {/* Price display has 4 states:
                    1. Artist hides price (priceHidden=true) → "Preț la cerere"
                    2. Anonymous + has price → "Preț la autentificare" CTA
                    3. Logged in + has price → show "de la X€"
                    4. No price set + not hidden → nothing */}
                {artist.priceHidden ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-gold/30 bg-gold/10 px-2.5 py-0.5 text-xs font-medium text-gold/90">
                    Preț la cerere
                  </span>
                ) : artist.priceFrom ? (
                  canSeeContact ? (
                    <span className="font-accent font-semibold text-gold">
                      {t("common.from")} {artist.priceFrom}€
                    </span>
                  ) : (
                    <a
                      href={`/sign-in?redirect_url=${encodeURIComponent(`/artisti/${artist.slug}`)}`}
                      className="inline-flex items-center gap-1 rounded-full border border-gold/30 bg-gold/10 px-2.5 py-0.5 text-xs font-medium text-gold/90 hover:text-gold"
                    >
                      <Lock className="h-3 w-3" /> Preț la autentificare
                    </a>
                  )
                ) : null}
              </div>

              {description && (
                <p className="mt-4 line-clamp-4 text-sm leading-relaxed text-white/58">
                  {description.replace(/<[^>]+>/g, "")}
                </p>
              )}

              <div className="mt-5 grid grid-cols-2 overflow-hidden rounded-xl border border-white/8 bg-[#0d1119]">
                <ArtistFact icon={CalendarDays} label="Evenimente" value="Private & corporate" />
                <ArtistFact icon={Clock3} label="Program" value="Personalizat" />
                <ArtistFact icon={Languages} label="Limbi" value="RO / RU" />
                <ArtistFact icon={Mic2} label="Format" value="Live & interactiv" />
              </div>
            </div>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="description" className="mt-6">
            <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-xl border border-white/8 bg-[#0c111b] p-1">
              <TabsTrigger value="description">{t("artist.description")}</TabsTrigger>
              <TabsTrigger value="gallery">{t("artist.gallery")} ({galleryImages.length})</TabsTrigger>
              {artist.videos.length > 0 && (
                <TabsTrigger value="videos">{t("artist.videos")} ({artist.videos.length})</TabsTrigger>
              )}
              {artist.packages.length > 0 && (
                <TabsTrigger value="packages">{t("artist.packages")}</TabsTrigger>
              )}
              <TabsTrigger value="reviews">{t("artist.reviews")} ({artist.reviews.length})</TabsTrigger>
              {ugcPhotos.length > 0 && (
                <TabsTrigger value="moments" className="gap-1.5">
                  <Camera className="h-3.5 w-3.5" /> Momente reale ({ugcPhotos.length})
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="description" className="mt-4 rounded-xl border border-white/8 bg-white/[.025] p-5">
              {description ? (
                <div className="prose prose-sm dark:prose-invert max-w-none text-white/62">
                  <p>{description}</p>
                </div>
              ) : (
                <p className="text-muted-foreground">Nu există descriere momentan.</p>
              )}
              {/* Phone number hidden from public view — only visible in admin panel */}
              {artist.instagram && canSeeContact && (
                <div className="mt-2">
                  <a
                    href={artist.instagram.startsWith("http") ? artist.instagram : `https://instagram.com/${artist.instagram.replace(/^@/, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-gold"
                  >
                    <Globe className="h-4 w-4" /> {artist.instagram}
                  </a>
                </div>
              )}
            </TabsContent>

            <TabsContent
              value="gallery"
              className="mt-4"
              onClickCapture={() => trackClick("artist", artist.id, "gallery")}
            >
              <ImageGallery
                images={galleryImages.map((img) => ({
                  url: img.url,
                  alt: img.altRo,
                }))}
              />
              {galleryImages.length === 0 && (
                <p className="text-muted-foreground">Nu există imagini momentan.</p>
              )}
            </TabsContent>

            {artist.videos.length > 0 && (
              <TabsContent value="videos" className="mt-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  {artist.videos.map((video) => (
                    <div key={video.id} className="aspect-video rounded-lg bg-muted overflow-hidden">
                      {video.videoId.includes(".mp4") ? (
                        <video
                          src={video.videoId}
                          controls
                          preload="metadata"
                          className="h-full w-full object-cover"
                        />
                      ) : video.videoId.includes("youtube.com") || video.videoId.includes("youtu.be") ? (
                        <iframe
                          src={`https://www.youtube.com/embed/${video.videoId.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]+)/)?.[1] || video.videoId}`}
                          className="h-full w-full"
                          allowFullScreen
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                          🎬 {video.title || "Video"}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </TabsContent>
            )}

            {artist.packages.length > 0 && (
              <TabsContent value="packages" className="mt-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  {artist.packages.map((pkg) => {
                    const pkgName = getLocalized(pkg, "name", locale);
                    const pkgDesc = getLocalized(pkg, "description", locale);
                    return (
                      <div key={pkg.id} className="flex flex-col rounded-lg border border-border/40 bg-card p-4">
                        <h3 className="font-heading text-base font-bold">{pkgName}</h3>
                        {pkgDesc && <p className="mt-1 text-sm text-muted-foreground">{pkgDesc}</p>}
                        <div className="mt-3 flex items-center justify-between">
                          {pkg.price && (
                            <span className="font-accent text-lg font-semibold text-gold">
                              {pkg.price}€
                            </span>
                          )}
                          {pkg.durationHours && (
                            <span className="text-xs text-muted-foreground">
                              {pkg.durationHours} {t("artist.duration_hours")}
                            </span>
                          )}
                        </div>
                        <div className="mt-4">
                          {/* Package booking also funnels through the
                              user's event plan now. The actual "Solicită
                              pachetul" CTA lives on /cabinet/planifica/[id]
                              ?tab=bookings, where the package_id can be
                              persisted alongside the booking. */}
                          <Link
                            href={
                              eventPlanId
                                ? `/cabinet/planifica/${eventPlanId}?tab=bookings&package=${pkg.id}`
                                : "/cabinet"
                            }
                            className="flex w-full items-center justify-center gap-2 rounded-lg bg-gold/10 px-4 py-2 text-sm font-medium text-gold ring-1 ring-gold/30 hover:bg-gold/20"
                          >
                            Solicită pachetul prin planul tău
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </TabsContent>
            )}

            {ugcPhotos.length > 0 && (
              <TabsContent value="moments" className="mt-4">
                <p className="mb-4 text-sm text-muted-foreground">
                  Fotografii încărcate de clienți reali care au lucrat cu acest artist.
                </p>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                  {ugcPhotos.map((p) => (
                    <figure
                      key={p.id}
                      className="overflow-hidden rounded-lg border border-border/40 bg-card"
                    >
                      { }
                      <img
                        src={p.url}
                        alt={p.caption || "Moment real de la eveniment"}
                        loading="lazy"
                        className="aspect-square w-full object-cover"
                      />
                      {p.caption && (
                        <figcaption className="p-2 text-xs text-muted-foreground line-clamp-2">
                          {p.caption}
                        </figcaption>
                      )}
                    </figure>
                  ))}
                </div>
              </TabsContent>
            )}

            <TabsContent value="reviews" className="mt-4">
              {/* Review Form */}
              <ReviewForm />

              {artist.reviews.length > 0 ? (
                <div className="mt-6 space-y-4">
                  {artist.reviews.map((review) => (
                    <div key={review.id} className="rounded-lg border border-border/40 bg-card p-4">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{review.authorName}</span>
                        <div className="flex items-center gap-1">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              className={`h-3.5 w-3.5 ${i < review.rating ? "fill-gold text-gold" : "text-muted"}`}
                            />
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
                                alt={`Fotografie recenzie ${i + 1}`}
                                className="h-full w-full object-cover"
                                loading="lazy"
                              />
                            </a>
                          ))}
                        </div>
                      )}
                      {review.reply && (
                        <div className="mt-3 rounded bg-accent/50 p-3 text-xs text-muted-foreground">
                          <span className="font-medium">Răspuns:</span> {review.reply}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-muted-foreground">Fii primul care lasă o recenzie!</p>
              )}
            </TabsContent>
          </Tabs>

          <section id="momente" className="mt-10 scroll-mt-24">
            <p className="text-[10px] font-semibold uppercase tracking-[.24em] text-[#e6b84d]">
              Portofoliu
            </p>
            <div className="mt-2 flex items-end justify-between gap-4">
              <h2 className="font-heading text-2xl font-semibold">Momente din evenimente</h2>
              <span className="text-xs text-white/38">{momentImages.length} fotografii</span>
            </div>
            <div
              className="mt-5 grid auto-rows-[190px] gap-3 sm:grid-cols-2 lg:grid-cols-3"
              onClickCapture={() => trackClick("artist", artist.id, "gallery")}
            >
              {momentImages.slice(0, 6).map((url, index) => (
                <a
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className={`group relative overflow-hidden rounded-xl border border-white/10 ${index === 0 ? "sm:row-span-2" : ""}`}
                >
                  <img
                    src={url}
                    alt={`${name} — moment din eveniment ${index + 1}`}
                    loading="lazy"
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent opacity-70" />
                  <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 text-[10px] text-white/72">
                    <Camera className="h-3 w-3 text-[#e6b84d]" /> Moment real
                  </span>
                </a>
              ))}
            </div>
          </section>

          {artist.videos.length > 0 && (
            <section className="mt-10">
              <p className="text-[10px] font-semibold uppercase tracking-[.24em] text-[#e6b84d]">Vezi artistul live</p>
              <h2 className="mt-2 font-heading text-2xl font-semibold">Showreel &amp; video</h2>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                {artist.videos.slice(0, 4).map((video) => (
                  <div key={video.id} className="aspect-video overflow-hidden rounded-xl border border-white/10 bg-[#0d1119]">
                    {video.videoId.includes(".mp4") ? (
                      <video src={video.videoId} controls preload="metadata" className="h-full w-full object-cover" />
                    ) : video.videoId.includes("youtube.com") || video.videoId.includes("youtu.be") ? (
                      <iframe
                        src={`https://www.youtube.com/embed/${video.videoId.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]+)/)?.[1] || video.videoId}`}
                        className="h-full w-full"
                        allowFullScreen
                        title={video.title || `Video ${name}`}
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-white/45">
                        {video.title || "Video"}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          <section id="pachete" className="mt-10 scroll-mt-24">
            <p className="text-[10px] font-semibold uppercase tracking-[.24em] text-[#e6b84d]">Alege experiența</p>
            <h2 className="mt-2 font-heading text-2xl font-semibold">Pachete disponibile</h2>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {profilePackages.map((pkg, index) => (
                <article
                  key={pkg.id}
                  className={`relative flex flex-col rounded-xl border bg-[linear-gradient(180deg,#111722,#0b1018)] p-5 ${
                    index === 1
                      ? "border-[#e6b84d]/60 shadow-[0_14px_35px_rgba(230,184,77,.08)]"
                      : "border-white/10"
                  }`}
                >
                  {index === 1 && (
                    <span className="absolute right-4 top-4 rounded-full bg-[#e6b84d] px-2.5 py-1 text-[9px] font-bold text-[#07101d]">
                      RECOMANDAT
                    </span>
                  )}
                  <Sparkles className="h-5 w-5 text-[#e6b84d]" />
                  <h3 className="mt-4 font-heading text-lg font-semibold">{pkg.name}</h3>
                  <p className="mt-2 min-h-14 text-xs leading-5 text-white/48">{pkg.description}</p>
                  <div className="mt-4 space-y-2 text-[11px] text-white/58">
                    <p className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-[#e6b84d]" /> Repertoriu personalizat</p>
                    <p className="flex items-center gap-2"><Clock3 className="h-3.5 w-3.5 text-[#e6b84d]" /> {pkg.durationHours || 2} ore de program</p>
                  </div>
                  <p className="mt-5 font-heading text-lg font-semibold text-[#e6b84d]">
                    {pkg.price ? `${pkg.price}€` : "Preț la cerere"}
                  </p>
                  <Link
                    href={
                      eventPlanId
                        ? `/cabinet/planifica/${eventPlanId}?tab=bookings${pkg.isReal ? `&package=${pkg.id}` : ""}`
                        : "/planifica"
                    }
                    className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#e6b84d]/45 bg-[#e6b84d]/8 text-xs font-semibold text-[#e6b84d] hover:bg-[#e6b84d]/15"
                  >
                    Solicită pachetul <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </article>
              ))}
            </div>
          </section>

          <section id="recenzii" className="mt-10 scroll-mt-24">
            <p className="text-[10px] font-semibold uppercase tracking-[.24em] text-[#e6b84d]">Feedback verificat</p>
            <h2 className="mt-2 font-heading text-2xl font-semibold">
              Recenzii de la clienți ({artist.reviews.length})
            </h2>
            {artist.reviews.length > 0 ? (
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {artist.reviews.slice(0, 4).map((review) => (
                  <article key={review.id} className="rounded-xl border border-white/8 bg-[#0d1119] p-5">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-sm font-semibold">{review.authorName}</span>
                      <div className="flex gap-0.5">
                        {Array.from({ length: 5 }).map((_, index) => (
                          <Star key={index} className={`h-3 w-3 ${index < review.rating ? "fill-gold text-gold" : "text-white/12"}`} />
                        ))}
                      </div>
                    </div>
                    {review.eventType && <p className="mt-1 text-[10px] uppercase tracking-wider text-[#e6b84d]">{review.eventType}</p>}
                    {review.text && <p className="mt-3 text-sm leading-6 text-white/55">{review.text}</p>}
                  </article>
                ))}
              </div>
            ) : (
              <p className="mt-5 rounded-xl border border-white/8 bg-white/[.02] p-5 text-sm text-white/48">
                Fii primul care lasă o recenzie pentru acest artist.
              </p>
            )}
            <div className="mt-5">
              <ReviewForm />
            </div>
          </section>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* CTA Buttons — branch by auth + price visibility:
              - Anonymous → single big "Înregistrează-te ca să vezi
                disponibilitatea și prețul" CTA
              - Logged in + price hidden → only "Cere ofertă" form
                (RequestPriceForm), no booking button (price negotiated)
              - Logged in + price visible → both Cere preț + Solicită
                rezervare buttons (existing UX) */}
          <div className="space-y-3 rounded-2xl border border-[#e6b84d]/55 bg-[linear-gradient(180deg,#161922,#0b1017)] p-5 shadow-[0_24px_60px_rgba(0,0,0,.34)] lg:sticky lg:top-20">
            <div className="border-b border-white/8 pb-4">
              <p className="text-[10px] font-semibold uppercase tracking-[.22em] text-[#e6b84d]">Rezervă artistul</p>
              <h2 className="mt-2 font-heading text-xl font-semibold text-[#fbf7ee]">
                Adaugă {name} la eveniment
              </h2>
              <div className="mt-3 flex items-center gap-2 text-xs text-white/48">
                <CalendarDays className="h-3.5 w-3.5 text-[#e6b84d]" />
                Alege data și solicită disponibilitatea
              </div>
              {artist.priceFrom && canSeeContact && !artist.priceHidden && (
                <p className="mt-4 font-heading text-2xl font-semibold text-[#e6b84d]">
                  de la {artist.priceFrom}€
                </p>
              )}
            </div>
            {!canSeeContact ? (
              <a
                href={`/sign-in?redirect_url=${encodeURIComponent(`/artisti/${artist.slug}`)}`}
                className="flex flex-col items-center gap-2 rounded-xl border border-gold/40 bg-gold/10 px-4 py-5 text-center hover:bg-gold/20"
              >
                <Lock className="h-5 w-5 text-gold" />
                <span className="font-heading font-bold text-gold">
                  Înregistrează-te pentru rezervare
                </span>
                <span className="text-xs text-muted-foreground">
                  După autentificare poți vedea disponibilitatea, prețul și
                  poți trimite cerere de rezervare.
                </span>
              </a>
            ) : artist.priceHidden ? (
              <>
                <RequestPriceForm artistId={artist.id} />
                <p className="text-center text-[11px] text-muted-foreground">
                  Acest artist nu publică tariful — solicită ofertă personalizată.
                </p>
              </>
            ) : (
              <>
                {/* Plan picker — opens a dialog with the user's existing
                    event plans, redirects to /planifica if they have
                    none, redirects to sign-in if they're not auth'd. */}
                <AddToEventButton
                  artistId={artist.id}
                  artistSlug={artist.slug}
                  presetEventPlanId={eventPlanId ?? null}
                />
                <p className="text-center text-[11px] text-muted-foreground">
                  Rezervările se fac doar din panoul evenimentului tău —
                  ai nevoie de un plan de eveniment activ.
                </p>
              </>
            )}
            <ChatWidget
              artistId={artist.id}
              artistName={name}
              artistSlug={artist.slug}
            />

            {/* Share buttons */}
            <div className="rounded-xl border border-border/40 bg-card p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Partajează
              </p>
              <ShareButtons
                title={`${name} — rezervă pentru evenimentul tău pe ePetrecere.md`}
                compact
              />
            </div>

            {/* Calendar removed from public profile — disponibilitatea se
                vede doar în fluxul de rezervare al unui plan de eveniment
                (/cabinet/planifica/[id]?tab=bookings). Public profile
                stays focused on the artist's portfolio + reviews. */}
          </div>
        </div>
      </div>

      {/* Avatar Lightbox */}
      {avatarOpen && profilePhotoUrl && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4"
          onClick={() => setAvatarOpen(false)}
        >
          <button
            type="button"
            onClick={() => setAvatarOpen(false)}
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
            aria-label="Închide"
          >
            <X className="h-6 w-6" />
          </button>
          <img
            src={profilePhotoUrl}
            alt={name}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] max-w-[90vw] rounded-2xl object-contain shadow-[0_20px_60px_rgba(0,0,0,0.7)]"
          />
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-black/50 backdrop-blur-sm px-4 py-1.5 text-sm text-white">
            {name}
          </div>
        </div>
      )}

      {/* Similar Artists */}
      {similar.length > 0 && (
        <section className="mt-16 border-t border-white/8 pt-10">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[.24em] text-[#e6b84d]">Descoperă mai multe</p>
              <h2 className="mt-2 font-heading text-2xl font-semibold">{t("artist.similar")}</h2>
            </div>
            <Link href="/artisti" className="inline-flex items-center gap-2 text-xs font-semibold text-[#e6b84d] hover:text-[#f1d684]">
              Vezi toți artiștii <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {similar.map((a) => (
              <ArtistCard key={a.id} artist={a} />
            ))}
          </div>
        </section>
      )}
    </div>
    </div>
  );
}

function ArtistFact({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarDays;
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

function ReviewForm() {
  return (
    <div className="rounded-xl border border-border/40 bg-card p-5">
      <h3 className="font-heading text-base font-bold">Recenzii verificate</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Recenzia poate fi trimisă după un eveniment confirmat, direct din
        cabinetul clientului. Astfel, feedbackul public provine din rezervări reale.
      </p>
      <Link
        href="/cabinet/recenzii"
        className="mt-4 inline-flex items-center gap-2 rounded-md bg-gold px-5 py-2.5 text-sm font-semibold text-[#0D0D0D] hover:bg-gold-dark"
      >
        Vezi rezervările eligibile <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
