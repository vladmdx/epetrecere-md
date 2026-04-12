"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Search, Edit, Star, BadgeCheck, Eye, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Artist {
  id: number; nameRo: string; slug: string; priceFrom: number | null;
  isActive: boolean; isFeatured: boolean; isVerified: boolean;
  ratingAvg: number | null; ratingCount: number | null;
  location: string | null;
}

export default function AdminArtistsPage() {
  const [artists, setArtists] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      try {
        // Fetch all artists for admin view (paginated in batches)
        let allArtists: Artist[] = [];
        let page = 1;
        let hasMore = true;
        while (hasMore) {
          const res = await fetch(`/api/artists?limit=100&page=${page}`);
          if (!res.ok) break;
          const data = await res.json();
          const items = data.items || [];
          allArtists = [...allArtists, ...items];
          hasMore = items.length === 100;
          page++;
        }
        setArtists(allArtists);
      } catch {
        toast.error("Nu s-au putut încărca artiștii");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = artists.filter((a) =>
    a.nameRo.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">Artiști</h1>
          <p className="text-sm text-muted-foreground">{artists.length} artiști în baza de date</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/import"><Button variant="outline" className="gap-2"><Sparkles className="h-4 w-4" /> Import</Button></Link>
          <Link href="/admin/artisti/new"><Button className="bg-gold text-background hover:bg-gold-dark gap-2"><Plus className="h-4 w-4" /> Adaugă Artist</Button></Link>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Caută artiști..." className="pl-9" />
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-gold" /></div>
      ) : (
        <div className="space-y-2">
          {filtered.map((artist) => (
            <Card key={artist.id} className="transition-all hover:border-gold/30">
              <CardContent className="flex items-center gap-4 py-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold/10 text-lg">🎵</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{artist.nameRo}</span>
                    {artist.isVerified && <BadgeCheck className="h-4 w-4 text-gold" />}
                    {artist.isFeatured && <Badge className="bg-gold/10 text-gold border-gold/30 text-xs">Featured</Badge>}
                    {!artist.isActive && <Badge variant="secondary" className="text-xs">Draft</Badge>}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                    {artist.location && <span>{artist.location}</span>}
                    {artist.priceFrom && <span>de la {artist.priceFrom}€</span>}
                    {artist.ratingAvg ? <span className="flex items-center gap-1"><Star className="h-3 w-3 fill-gold text-gold" /> {artist.ratingAvg}</span> : null}
                  </div>
                </div>
                <Link href={`/artisti/${artist.slug}`} target="_blank"><Button variant="ghost" size="icon"><Eye className="h-4 w-4" /></Button></Link>
                <Link href={`/admin/artisti/${artist.id}`}><Button variant="ghost" size="icon"><Edit className="h-4 w-4" /></Button></Link>
              </CardContent>
            </Card>
          ))}
          {filtered.length === 0 && <p className="py-8 text-center text-muted-foreground">Nu s-au găsit artiști</p>}
        </div>
      )}
    </div>
  );
}
