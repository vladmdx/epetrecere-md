"use client";

// Client's wishlist — artists + venues they've hearted.
// Features: grid view (3/4/5 cols responsive), list view, category filter,
// and type filter (all/artists/venues).

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Heart,
  Loader2,
  MapPin,
  Music,
  Building2,
  Trash2,
  LayoutGrid,
  List as ListIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Category {
  id: number;
  name: string;
  slug: string;
}

interface WishlistItem {
  entityType: "artist" | "venue";
  entityId: number;
  name: string;
  slug: string;
  coverImageUrl: string | null;
  priceFrom: number | null;
  city: string | null;
  categories: Category[];
  addedAt: string;
}

type ViewMode = "grid" | "list";
type TypeFilter = "all" | "artist" | "venue";

export default function WishlistPage() {
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("grid");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [categoryId, setCategoryId] = useState<number | null>(null);

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

  // Extract unique categories present in wishlist for filter pills
  const availableCategories = useMemo(() => {
    const map = new Map<number, Category>();
    for (const item of items) {
      for (const cat of item.categories) {
        map.set(cat.id, cat);
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);

  // Apply filters
  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (typeFilter !== "all" && item.entityType !== typeFilter) return false;
      if (categoryId !== null) {
        if (!item.categories.some((c) => c.id === categoryId)) return false;
      }
      return true;
    });
  }, [items, typeFilter, categoryId]);

  const counts = useMemo(
    () => ({
      all: items.length,
      artist: items.filter((i) => i.entityType === "artist").length,
      venue: items.filter((i) => i.entityType === "venue").length,
    }),
    [items],
  );

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold">Favoritele mele</h1>
          <p className="text-sm text-muted-foreground">
            {items.length > 0
              ? `${filtered.length} din ${items.length} ${
                  items.length === 1 ? "element" : "elemente"
                }`
              : "Artiștii și sălile salvate pentru mai târziu."}
          </p>
        </div>
        {items.length > 0 && (
          <div className="flex items-center gap-1 rounded-lg border border-border/40 bg-card p-1">
            <button
              type="button"
              onClick={() => setView("grid")}
              aria-label="Grid view"
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all",
                view === "grid"
                  ? "bg-gold text-[#0D0D0D]"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Grid
            </button>
            <button
              type="button"
              onClick={() => setView("list")}
              aria-label="List view"
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all",
                view === "list"
                  ? "bg-gold text-[#0D0D0D]"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <ListIcon className="h-3.5 w-3.5" />
              Listă
            </button>
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Heart className="h-10 w-10 text-gold/40" />
            <p className="text-sm font-medium">
              Niciun artist sau sală salvat încă
            </p>
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
                  <Building2 className="h-4 w-4" /> Săli
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Type filter */}
          <div className="flex flex-wrap gap-2">
            {(
              [
                { key: "all" as const, label: "Toate", count: counts.all },
                {
                  key: "artist" as const,
                  label: "Artiști",
                  count: counts.artist,
                  icon: Music,
                },
                {
                  key: "venue" as const,
                  label: "Săli",
                  count: counts.venue,
                  icon: Building2,
                },
              ] as const
            ).map((opt) => {
              const Icon = "icon" in opt ? opt.icon : null;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => {
                    setTypeFilter(opt.key);
                    setCategoryId(null); // reset category when changing type
                  }}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
                    typeFilter === opt.key
                      ? "border-gold bg-gold text-[#0D0D0D]"
                      : "border-border/40 text-muted-foreground hover:border-gold/40 hover:text-foreground",
                  )}
                >
                  {Icon && <Icon className="h-3 w-3" />}
                  {opt.label}
                  <span
                    className={cn(
                      "ml-0.5 rounded-full px-1.5 text-[10px]",
                      typeFilter === opt.key
                        ? "bg-black/20"
                        : "bg-muted/50",
                    )}
                  >
                    {opt.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Category filter — only show if there are categories available */}
          {availableCategories.length > 0 && typeFilter !== "venue" && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setCategoryId(null)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs transition-all",
                  categoryId === null
                    ? "border-gold/50 bg-gold/10 text-gold"
                    : "border-border/30 text-muted-foreground hover:border-gold/30",
                )}
              >
                Toate categoriile
              </button>
              {availableCategories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() =>
                    setCategoryId(categoryId === cat.id ? null : cat.id)
                  }
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs transition-all",
                    categoryId === cat.id
                      ? "border-gold/50 bg-gold/10 text-gold"
                      : "border-border/30 text-muted-foreground hover:border-gold/30",
                  )}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          )}

          {filtered.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
                <Heart className="h-8 w-8 text-gold/40" />
                <p className="text-sm text-muted-foreground">
                  Nu ai elemente salvate în această categorie
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setTypeFilter("all");
                    setCategoryId(null);
                  }}
                >
                  Resetează filtrele
                </Button>
              </CardContent>
            </Card>
          ) : view === "grid" ? (
            <GridView
              items={filtered}
              onRemove={remove}
              removing={removing}
            />
          ) : (
            <ListView
              items={filtered}
              onRemove={remove}
              removing={removing}
            />
          )}
        </>
      )}
    </div>
  );
}

// ─── Grid View ──────────────────────────────────────────────
function GridView({
  items,
  onRemove,
  removing,
}: {
  items: WishlistItem[];
  onRemove: (item: WishlistItem) => void;
  removing: string | null;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
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
              <div className="relative aspect-[4/5] bg-muted">
                {item.coverImageUrl ? (
                  <Image
                    src={item.coverImageUrl}
                    alt={item.name}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 33vw, 20vw"
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
                  {item.categories.length > 0 && (
                    <p className="mt-0.5 line-clamp-1 text-[10px] text-gold/80">
                      {item.categories.map((c) => c.name).join(", ")}
                    </p>
                  )}
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                    {item.city && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {item.city}
                      </span>
                    )}
                    {item.priceFrom && (
                      <span className="text-gold">de la {item.priceFrom}€</span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(item)}
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
  );
}

// ─── List View ──────────────────────────────────────────────
function ListView({
  items,
  onRemove,
  removing,
}: {
  items: WishlistItem[];
  onRemove: (item: WishlistItem) => void;
  removing: string | null;
}) {
  return (
    <div className="space-y-2">
      {items.map((item) => {
        const href =
          item.entityType === "artist"
            ? `/artisti/${item.slug}`
            : `/sali/${item.slug}`;
        const k = `${item.entityType}:${item.entityId}`;
        return (
          <Card
            key={k}
            className="overflow-hidden transition-all hover:border-gold/30"
          >
            <div className="flex items-center gap-4 p-3">
              <Link href={href} className="shrink-0">
                <div className="relative h-20 w-20 overflow-hidden rounded-lg bg-muted sm:h-24 sm:w-24">
                  {item.coverImageUrl ? (
                    <Image
                      src={item.coverImageUrl}
                      alt={item.name}
                      fill
                      sizes="96px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
                      {item.entityType === "artist" ? (
                        <Music className="h-6 w-6" />
                      ) : (
                        <Building2 className="h-6 w-6" />
                      )}
                    </div>
                  )}
                </div>
              </Link>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Link
                    href={href}
                    className="line-clamp-1 font-heading font-bold hover:text-gold"
                  >
                    {item.name}
                  </Link>
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-medium">
                    {item.entityType === "artist" ? (
                      <>
                        <Music className="h-2.5 w-2.5" /> Artist
                      </>
                    ) : (
                      <>
                        <Building2 className="h-2.5 w-2.5" /> Sală
                      </>
                    )}
                  </span>
                </div>
                {item.categories.length > 0 && (
                  <p className="mt-0.5 line-clamp-1 text-xs text-gold/80">
                    {item.categories.map((c) => c.name).join(", ")}
                  </p>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  {item.city && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {item.city}
                    </span>
                  )}
                  {item.priceFrom && (
                    <span className="text-gold">de la {item.priceFrom}€</span>
                  )}
                  <span className="hidden sm:inline">
                    Salvat {new Date(item.addedAt).toLocaleDateString("ro-RO", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <Link href={href}>
                  <Button size="sm" variant="outline" className="text-xs">
                    Vezi
                  </Button>
                </Link>
                <button
                  type="button"
                  onClick={() => onRemove(item)}
                  disabled={removing === k}
                  aria-label="Șterge din favorite"
                  className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-red-500/10 hover:text-red-400"
                >
                  {removing === k ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
