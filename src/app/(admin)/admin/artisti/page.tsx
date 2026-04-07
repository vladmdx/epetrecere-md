"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Plus, Search, Edit, Star, BadgeCheck, Eye, Sparkles } from "lucide-react";

const demoArtists = [
  { id: 1, nameRo: "Ion Suruceanu", slug: "ion-suruceanu", category: "Cântăreți", priceFrom: 1000, isActive: true, isFeatured: true, isVerified: true, ratingAvg: 4.8, ratingCount: 25 },
  { id: 2, nameRo: "Zdob și Zdub", slug: "zdob-si-zdub", category: "Formații", priceFrom: 2000, isActive: true, isFeatured: true, isVerified: true, ratingAvg: 4.9, ratingCount: 42 },
  { id: 3, nameRo: "DJ Andrei", slug: "dj-andrei", category: "DJ", priceFrom: 200, isActive: true, isFeatured: false, isVerified: true, ratingAvg: 4.5, ratingCount: 18 },
  { id: 4, nameRo: "MC Vitalie", slug: "mc-vitalie", category: "Moderatori", priceFrom: 300, isActive: false, isFeatured: false, isVerified: false, ratingAvg: 0, ratingCount: 0 },
];

export default function AdminArtistsPage() {
  const [search, setSearch] = useState("");

  const filtered = demoArtists.filter((a) =>
    a.nameRo.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">Artiști</h1>
          <p className="text-sm text-muted-foreground">{demoArtists.length} artiști în baza de date</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/import">
            <Button variant="outline" className="gap-2"><Sparkles className="h-4 w-4" /> Import</Button>
          </Link>
          <Button className="bg-gold text-background hover:bg-gold-dark gap-2">
            <Plus className="h-4 w-4" /> Adaugă Artist
          </Button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Caută artiști..." className="pl-9" />
      </div>

      <div className="space-y-2">
        {filtered.map((artist) => (
          <Card key={artist.id} className="transition-all hover:border-gold/30">
            <CardContent className="flex items-center gap-4 py-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold/10 text-lg">
                🎵
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{artist.nameRo}</span>
                  {artist.isVerified && <BadgeCheck className="h-4 w-4 text-gold" />}
                  <Badge variant="secondary" className="text-xs">{artist.category}</Badge>
                  {artist.isFeatured && <Badge className="bg-gold/10 text-gold border-gold/30 text-xs">Featured</Badge>}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                  <span>de la {artist.priceFrom}€</span>
                  {artist.ratingAvg > 0 && (
                    <span className="flex items-center gap-1"><Star className="h-3 w-3 fill-gold text-gold" /> {artist.ratingAvg}</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Switch checked={artist.isActive} />
                <Link href={`/artisti/${artist.slug}`} target="_blank">
                  <Button variant="ghost" size="icon"><Eye className="h-4 w-4" /></Button>
                </Link>
                <Link href={`/admin/artisti/${artist.id}`}>
                  <Button variant="ghost" size="icon"><Edit className="h-4 w-4" /></Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
