"use client";

import { useState } from "react";
import { Star, BadgeCheck, Crown, MapPin, Phone, Globe, CalendarDays } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArtistCard } from "@/components/public/artist-card";
import { CalendarWidget } from "@/components/public/calendar-widget";
import { ImageGallery } from "@/components/public/image-gallery";
import { RequestForm } from "@/components/public/request-form";
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
  const [selectedDate, setSelectedDate] = useState<string | undefined>();

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
            <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-gold bg-card">
              {artist.images?.[0]?.url ? (
                <img src={artist.images[0].url} alt={name} className="h-full w-full object-cover" />
              ) : (
                <span className="text-3xl">🎵</span>
              )}
            </div>
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
              {(artist.phone || artist.website) && (
                <div className="mt-6 flex flex-wrap gap-3">
                  {artist.phone && (
                    <a href={`tel:${artist.phone}`} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-gold">
                      <Phone className="h-4 w-4" /> {artist.phone}
                    </a>
                  )}
                  {artist.website && (
                    <a href={artist.website} target="_blank" rel="noopener" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-gold">
                      <Globe className="h-4 w-4" /> Website
                    </a>
                  )}
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
                    <div key={video.id} className="aspect-video rounded-lg bg-muted flex items-center justify-center">
                      <span className="text-muted-foreground text-sm">
                        🎬 {video.platform}: {video.videoId}
                      </span>
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
              {artist.reviews.length > 0 ? (
                <div className="space-y-4">
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
                <p className="text-muted-foreground">Nu există recenzii momentan.</p>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* CTA Buttons */}
          <div className="sticky top-20 space-y-3">
            <RequestForm
              trigger={
                <Button className="w-full bg-gold text-background hover:bg-gold-dark text-base py-6">
                  {t("artist.request_price")}
                </Button>
              }
              artistId={artist.id}
              preselectedDate={selectedDate}
            />
            <Button variant="outline" className="w-full border-gold text-gold hover:bg-gold/10 py-6">
              <CalendarDays className="mr-2 h-4 w-4" />
              {t("artist.check_availability")}
            </Button>

            {/* Calendar */}
            <CalendarWidget
              entityType="artist"
              entityId={artist.id}
              enabled={artist.calendarEnabled}
              onDateSelect={(date) => setSelectedDate(date)}
            />
          </div>
        </div>
      </div>

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
