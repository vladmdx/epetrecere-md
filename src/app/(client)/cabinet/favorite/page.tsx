"use client";

// Client's wishlist — artists + venues they've hearted. Calls /api/wishlist
// on mount; empty state with CTA to browse if the list is empty.

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Heart,
  Loader2,
  MapPin,
  Music,
  Building2,
  Trash2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface WishlistItem {
  entityType: "artist" | "venue";
  entityId: number;
  name: string;
  slug: string;
  coverImageUrl: string | null;
  priceFrom: number | null;
  city: string | null;
  addedAt: string;
}

export default function WishlistPage() {
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/wishlist", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((data) => setItems(Array.isArray(data.items) ? data.items : []))
      .catch(() => toast.error("Nu am putut încărca lista"))
      .finally(() => setLoading(false));
  }, []);

  async function remove(item: WishlistItem) {
    const k = `${item.entityType}:${item.entityId}`;
    setRemoving(k);
    try {
      const res = await fetch(
        `/api/wishlist?entityType=${item.entityType}&entityId=${item.entityId}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error();
      setItems((prev) =>
        prev.filter(
          (i) =>
            !(
              i.entityType === item.entityType && i.entityId === item.entityId
            ),
        ),
      );
      toast.success("Scos din favorite");
    } catch {
      toast.error("Eroare la ștergere");
    } finally {
      setRemoving(null);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Favoritele mele</h1>
        <p className="text-sm text-muted-foreground">
          Artiștii și sălile salvate pentru mai târziu.
        </p>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Heart className="h-10 w-10 text-gold/40" />
            <p className="text-sm font-medium">Niciun artist sau sală salvat încă</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Apasă pe inimioara ❤ de pe orice card de artist sau sală pentru a
              salva rapid pentru mai târziu.
            </p>
            <div className="mt-3 flex gap-2">
              <Link href="/artisti">
                <Button className="gap-2 bg-gold text-[#0D0D0D] hover:bg-gold-dark">
                  <Music className="h-4 w-4" /> Explorează artiști
                </Button>
              </Link>
              <Link href="/sali">
                <Button variant="outline" className="gap-2">
                  <Building2 className="h-4 w-4" /> Sali
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => {
            const href =
              item.entityType === "artist"
                ? `/artisti/${item.slug}`
                : `/sali/${item.slug}`;
            const k = `${item.entityType}:${item.entityId}`;
            return (
              <Card
                key={k}
                className="group overflow-hidden transition-all hover:border-gold/30"
              >
                <Link href={href} className="block">
                  <div className="relative aspect-[16/10] bg-muted">
                    {item.entityType === "artist" && item.coverImageUrl ? (
                      <Image
                        src={item.coverImageUrl}
                        alt={item.name}
                        fill
                        sizes="(max-width: 640px) 100vw, 33vw"
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
                        {item.entityType === "artist" ? (
                          <Music className="h-10 w-10" />
                        ) : (
                          <Building2 className="h-10 w-10" />
                        )}
                      </div>
                    )}
                    <div className="absolute left-2 top-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-background/80 px-2 py-0.5 text-[10px] font-medium backdrop-blur-sm">
                        {item.entityType === "artist" ? (
                          <>
                            <Music className="h-3 w-3" /> Artist
                          </>
                        ) : (
                          <>
                            <Building2 className="h-3 w-3" /> Sală
                          </>
                        )}
                      </span>
                    </div>
                  </div>
                </Link>
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={href}
                        className="line-clamp-1 font-semibold hover:text-gold"
                      >
                        {item.name}
                      </Link>
                      <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                        {item.city && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {item.city}
                          </span>
                        )}
                        {item.priceFrom && (
                          <span className="text-gold">
                            de la {item.priceFrom}€
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => remove(item)}
                      disabled={removing === k}
                      aria-label="Șterge din favorite"
                      className="shrink-0 rounded-full p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-400"
                    >
                      {removing === k ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
