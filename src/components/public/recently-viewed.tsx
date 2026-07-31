"use client";

// Recently viewed strip — horizontal carousel of thumbnails the user
// opened recently. Safe to render on any page; renders nothing if the
// list is empty so it doesn't take up space.

import Link from "next/link";
import { useRecentlyViewed, type RecentEntity } from "@/hooks/use-recently-viewed";
import { History, Music, Building2 } from "lucide-react";

interface Props {
  type: RecentEntity;
  /** Optional title override. */
  title?: string;
  className?: string;
}

export function RecentlyViewed({ type, title, className }: Props) {
  const items = useRecentlyViewed(type);
  if (items.length === 0) return null;

  const defaultTitle = type === "venue" ? "Săli vizualizate recent" : "Artiști vizualizați recent";
  const base = type === "venue" ? "/sali" : "/artisti";
  const Icon = type === "venue" ? Building2 : Music;

  return (
    <section className={className}>
      <div className="mb-3 flex items-center gap-2">
        <History className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {title ?? defaultTitle}
        </h2>
      </div>
      <div className="-mx-2 flex gap-3 overflow-x-auto px-2 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((it) => (
          <Link
            key={it.slug}
            href={`${base}/${it.slug}`}
            className="group block w-32 shrink-0 snap-start"
          >
            <div className="relative aspect-[4/5] overflow-hidden rounded-xl border border-border/40 bg-muted transition-all group-hover:border-gold/40">
              {it.imageUrl ? (

                <img
                  src={it.imageUrl}
                  alt={it.name}
                  className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
                  <Icon className="h-8 w-8" />
                </div>
              )}
            </div>
            <p className="mt-2 line-clamp-2 text-xs font-medium group-hover:text-gold">
              {it.name}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
