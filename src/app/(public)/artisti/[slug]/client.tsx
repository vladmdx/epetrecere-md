"use client";

import { useState } from "react";
import { Star, BadgeCheck, Crown, MapPin, Phone, Globe, CalendarDays, X, ZoomIn } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArtistCard } from "@/components/public/artist-card";
import { ImageGallery } from "@/components/public/image-gallery";
import { RequestPriceForm, RequestBookingForm } from "@/components/public/request-form";
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
    createdAt: Date;
  }>;
}

interface Props {
  artist: ArtistData;
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

export function ArtistDetailClient({ artist, similar }: Props) {
  const { locale, t } = useLocale();
  const name = getLocalized(artist, "name", locale);
  const description = getLocalized(artist, "description", locale);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const coverImage = artist.images?.[0];
  const isPlaceholder = coverImage?.url?.includes("placeholder.svg");

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
      {/* Breadcrumb */}
      <nav className="mb-6 text-xs text-muted-foreground">
        <a href="/" className="hover:text-gold">Acasă</a>
        <span className="mx-2">/</span>
        <a href="/artisti" className="hover:text-gold">{t("nav.artists")}</a>
        <span className="mx-2">/</span>
        <span className="text-foreground">{name}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Main Content */}
        <div className="lg:col-span-2">
          {/* Profile Header */}
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start">
            <button
              type="button"
              onClick={() => !isPlaceholder && coverImage?.url && setAvatarOpen(true)}
              disabled={isPlaceholder || !coverImage?.url}
              className="group relative flex h-32 w-32 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-gold bg-card shadow-[0_0_20px_rgba(201,168,76,0.15)] transition-all hover:shadow-[0_0_30px_rgba(201,168,76,0.35)] disabled:cursor-default disabled:hover:shadow-[0_0_20px_rgba(201,168,76,0.15)]"
              aria-label={isPlaceholder ? name : `Vezi poza mare a lui ${name}`}
            >
              {coverImage?.url ? (
                <>
                  <img
                    src={coverImage.url}
                    alt={name}
                    className={`h-full w-full object-cover transition-transform duration-300 ${!isPlaceholder ? "group-hover:scale-105" : ""}`}
                  />
                  {!isPlaceholder && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover:bg-black/40 group-hover:opacity-100">
                      <ZoomIn className="h-6 w-6 text-white" />
                    </div>
                  )}
                </>
              ) : (
                <span className="text-3xl">🎵</span>
              )}
            </button>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-heading text-2xl font-bold md:text-3xl">{name}</h1>
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
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
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
                {artist.priceFrom && (
                  <span className="font-accent font-semibold text-gold">
                    {t("common.from")} {artist.priceFrom}€
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="description" className="mt-6">
            <TabsList className="w-full justify-start">
              <TabsTrigger value="description">{t("artist.description")}</TabsTrigger>
              <TabsTrigger value="gallery">{t("artist.gallery")} ({artist.images.length})</TabsTrigger>
              {artist.videos.length > 0 && (
                <TabsTrigger value="videos">{t("artist.videos")} ({artist.videos.length})</TabsTrigger>
              )}
              {artist.packages.length > 0 && (
                <TabsTrigger value="packages">{t("artist.packages")}</TabsTrigger>
              )}
              <TabsTrigger value="reviews">{t("artist.reviews")} ({artist.reviews.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="description" className="mt-4">
              {description ? (
                <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground">
                  <p>{description}</p>
                </div>
              ) : (
                <p className="text-muted-foreground">Nu există descriere momentan.</p>
              )}
              {artist.phone && (
                <div className="mt-6">
                  <a href={`tel:${artist.phone}`} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-gold">
                    <Phone className="h-4 w-4" /> {artist.phone}
                  </a>
                </div>
              )}
            </TabsContent>

            <TabsContent value="gallery" className="mt-4">
              <ImageGallery
                images={artist.images.map((img) => ({
                  url: img.url,
                  alt: img.altRo,
                }))}
              />
              {artist.images.length === 0 && (
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
                      <div key={pkg.id} className="rounded-lg border border-border/40 bg-card p-4">
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
                      </div>
                    );
                  })}
                </div>
              </TabsContent>
            )}

            <TabsContent value="reviews" className="mt-4">
              {/* Review Form */}
              <ReviewForm artistId={artist.id} />

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
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* CTA Buttons */}
          <div className="sticky top-20 space-y-3">
            <RequestPriceForm artistId={artist.id} />
            <RequestBookingForm
              artistId={artist.id}
              icon={<CalendarDays className="h-4 w-4" />}
            />
          </div>
        </div>
      </div>

      {/* Avatar Lightbox */}
      {avatarOpen && coverImage?.url && (
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
            src={coverImage.url}
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
        <div className="mt-16">
          <h2 className="mb-6 font-heading text-2xl font-bold">{t("artist.similar")}</h2>
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
            {similar.map((a) => (
              <ArtistCard key={a.id} artist={a} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ReviewForm({ artistId }: { artistId: number }) {
  const [rating, setRating] = useState(5);
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [eventType, setEventType] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !text) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artistId, authorName: name, rating, text, eventType: eventType || undefined }),
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
        <p className="font-heading font-bold text-success">Mulțumim pentru recenzie!</p>
        <p className="mt-1 text-sm text-muted-foreground">Recenzia va fi publicată după verificare.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-border/40 bg-card p-5">
      <h3 className="mb-4 font-heading text-base font-bold">Lasă o recenzie</h3>
      <div className="mb-4 flex gap-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <button key={i} type="button" onClick={() => setRating(i + 1)}>
            <Star className={`h-6 w-6 cursor-pointer transition-colors ${i < rating ? "fill-gold text-gold" : "text-muted hover:text-gold/50"}`} />
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
      <button
        type="submit"
        disabled={submitting || !name || text.length < 10}
        className="mt-3 inline-flex items-center gap-2 rounded-md bg-gold px-6 py-2 text-sm font-medium text-background hover:bg-gold-dark disabled:opacity-50"
      >
        {submitting ? "Se trimite..." : "Trimite Recenzia"}
      </button>
    </form>
  );
}
