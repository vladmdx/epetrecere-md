"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useUser } from "@clerk/nextjs";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Music, Search, MapPin, Star, Loader2, ExternalLink, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { MOLDOVA_CITIES, DEFAULT_CITY } from "@/lib/moldova-cities";

interface Artist {
  id: number;
  slug: string;
  nameRo: string;
  baseCity: string | null;
  travelDistanceKm: number | null;
  priceFrom: number | null;
  priceHidden: boolean;
  ratingAvg: number | null;
  ratingCount: number | null;
  photoUrl: string | null;
  coverImageUrl: string | null;
  location: string | null;
}

const RECENT_KEY = "epetrecere.recent-bookings";

export default function StandaloneArtistBookingPage() {
  const { isSignedIn, isLoaded } = useUser();
  const [city, setCity] = useState(DEFAULT_CITY);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(false);
  const [debounced, setDebounced] = useState({ city: DEFAULT_CITY, search: "" });

  // Debounce filter changes so we don't hammer /api/artists on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebounced({ city, search }), 300);
    return () => clearTimeout(t);
  }, [city, search]);

  // Fetch artists matching city + optional search.
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    const ctrl = new AbortController();
    setLoading(true);
    const qs = new URLSearchParams();
    qs.set("limit", "24");
    if (debounced.city) qs.set("city", debounced.city);
    if (debounced.search.trim()) qs.set("q", debounced.search.trim());
    fetch(`/api/artists?${qs.toString()}`, { signal: ctrl.signal, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((data) => setResults(data.items ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [debounced, isLoaded, isSignedIn]);

  if (isLoaded && !isSignedIn) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <Music className="mx-auto mb-3 h-10 w-10 text-gold" />
        <h1 className="font-heading text-2xl font-bold">Rezervare Artist</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Înregistrează-te pentru a vedea artiștii disponibili în orașul tău.
        </p>
        <Link href="/sign-in?redirect_url=/cabinet/rezervare-artist">
          <Button className="mt-4 bg-gold text-[#0D0D0D] hover:bg-gold-dark">
            Autentificare
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Rezervă un artist</h1>
        <p className="text-sm text-muted-foreground">
          Caută și rezervă direct un artist — fără să fii nevoit să creezi un
          eveniment complet. Trimite cererea, artistul îți răspunde cu prețul.
        </p>
      </div>

      {/* Search filters */}
      <Card>
        <CardContent className="grid gap-4 p-4 sm:grid-cols-3">
          <div>
            <Label className="text-xs">Localitate</Label>
            <select
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {MOLDOVA_CITIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">Caută după nume</Label>
            <div className="relative mt-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ex: Igor Nedoseikin"
                className="pl-9"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-gold" />
        </div>
      ) : results.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <Music className="mx-auto mb-3 h-8 w-8 opacity-40" />
            <p className="text-sm">
              Niciun artist găsit pentru filtrul curent.
            </p>
            <p className="mt-1 text-xs">
              Schimbă orașul sau caută după nume.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((a) => (
            <ArtistResultCard key={a.id} artist={a} />
          ))}
        </div>
      )}

      {/* Quick link to existing bookings */}
      <Card className="bg-muted/20">
        <CardContent className="flex items-center justify-between gap-4 p-4">
          <div className="flex items-center gap-3">
            <BookOpen className="h-5 w-5 text-gold" />
            <div>
              <p className="text-sm font-medium">Rezervările mele</p>
              <p className="text-xs text-muted-foreground">
                Vezi toate cererile trimise — atât cele standalone cât și cele
                legate de evenimente.
              </p>
            </div>
          </div>
          <Link href="/cabinet/rezervari">
            <Button variant="outline" size="sm" className="gap-1">
              Vezi rezervările
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

function ArtistResultCard({ artist }: { artist: Artist }) {
  const img = artist.photoUrl || artist.coverImageUrl;
  return (
    <Link
      href={`/artisti/${artist.slug}`}
      className="group block overflow-hidden rounded-xl border border-border/40 bg-card transition-all hover:border-gold/40"
    >
      <div className="relative aspect-square overflow-hidden bg-muted">
        {img ? (
          <Image
            src={img}
            alt={artist.nameRo}
            fill
            sizes="(max-width: 640px) 100vw, 33vw"
            className="object-cover transition-transform duration-500 group-hover:scale-110"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground/30">
            <Music className="h-12 w-12" />
          </div>
        )}
      </div>
      <div className="p-3">
        <p className="font-heading text-sm font-bold truncate group-hover:text-gold transition-colors">
          {artist.nameRo}
        </p>
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {artist.baseCity || artist.location || "—"}
          </span>
          {artist.ratingAvg != null && artist.ratingCount! > 0 && (
            <span className="flex items-center gap-1">
              <Star className="h-3 w-3 fill-gold text-gold" />
              {artist.ratingAvg.toFixed(1)}
            </span>
          )}
        </div>
        <div className="mt-2 flex items-center justify-between">
          {artist.priceHidden ? (
            <span className="text-xs text-gold/80">Preț la cerere</span>
          ) : artist.priceFrom ? (
            <span className="text-xs font-semibold text-gold">de la {artist.priceFrom}€</span>
          ) : (
            <span className="text-xs text-muted-foreground">Preț nesetat</span>
          )}
          <span className="text-[11px] text-gold opacity-0 transition-opacity group-hover:opacity-100">
            Vezi profil →
          </span>
        </div>
      </div>
    </Link>
  );
}
