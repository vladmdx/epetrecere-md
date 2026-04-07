"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Search, Music, Building2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/hooks/use-locale";
import { cn } from "@/lib/utils";

interface SearchResult {
  id: number;
  slug: string;
  name_ro: string;
  name_ru?: string | null;
  location?: string | null;
  city?: string | null;
  price_from?: number | null;
  price_per_person?: number | null;
  rating_avg?: number | null;
  type: "artist" | "venue";
}

export function SearchAutocomplete() {
  const { t } = useLocale();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<{ artists: SearchResult[]; venues: SearchResult[] }>({
    artists: [],
    venues: [],
  });
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>(undefined);

  useEffect(() => {
    if (query.length < 2) {
      setResults({ artists: [], venues: [] });
      setOpen(false);
      return;
    }

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data);
          setOpen(true);
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(debounceRef.current);
  }, [query]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const hasResults = results.artists.length > 0 || results.venues.length > 0;

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => hasResults && setOpen(true)}
          placeholder={t("search.placeholder")}
          className="w-64 pl-9 pr-8 lg:w-80"
        />
        {query && (
          <button
            onClick={() => {
              setQuery("");
              setOpen(false);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-full min-w-[320px] rounded-lg border border-border/40 bg-popover shadow-lg">
          {loading && (
            <div className="px-4 py-3 text-sm text-muted-foreground">
              {t("common.loading")}
            </div>
          )}

          {!loading && !hasResults && query.length >= 2 && (
            <div className="px-4 py-3 text-sm text-muted-foreground">
              {t("common.noResults")}
            </div>
          )}

          {results.artists.length > 0 && (
            <div>
              <div className="border-b border-border/40 px-4 py-2 text-xs font-medium uppercase tracking-wider text-gold">
                {t("nav.artists")}
              </div>
              {results.artists.map((item) => (
                <Link
                  key={`artist-${item.id}`}
                  href={`/artisti/${item.slug}`}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-accent"
                >
                  <Music className="h-4 w-4 shrink-0 text-gold" />
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-medium">{item.name_ro}</p>
                    {item.location && (
                      <p className="text-xs text-muted-foreground">{item.location}</p>
                    )}
                  </div>
                  {item.price_from && (
                    <span className="shrink-0 font-accent text-xs text-gold">
                      {item.price_from}€
                    </span>
                  )}
                </Link>
              ))}
            </div>
          )}

          {results.venues.length > 0 && (
            <div>
              <div className="border-b border-border/40 px-4 py-2 text-xs font-medium uppercase tracking-wider text-gold">
                {t("nav.venues")}
              </div>
              {results.venues.map((item) => (
                <Link
                  key={`venue-${item.id}`}
                  href={`/sali/${item.slug}`}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-accent"
                >
                  <Building2 className="h-4 w-4 shrink-0 text-gold" />
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-medium">{item.name_ro}</p>
                    {item.city && (
                      <p className="text-xs text-muted-foreground">{item.city}</p>
                    )}
                  </div>
                  {item.price_per_person && (
                    <span className="shrink-0 font-accent text-xs text-gold">
                      {item.price_per_person}€/pers
                    </span>
                  )}
                </Link>
              ))}
            </div>
          )}

          {hasResults && (
            <Link
              href={`/artisti?q=${encodeURIComponent(query)}`}
              onClick={() => setOpen(false)}
              className="block border-t border-border/40 px-4 py-2.5 text-center text-xs font-medium text-gold hover:bg-accent"
            >
              {t("common.viewAll")} →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
