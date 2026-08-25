"use client";

// Photo Moments collage builder.
//
// Renders every photo the owner has on the plan in one of three layouts
// they can pick from a dropdown. The "Tipărește colaj" button just calls
// window.print(); the page's @media print rules strip the chrome so the
// PDF/printer gets a clean, full-bleed poster.
//
// We re-use the existing /api/event-plans/[id]/photos endpoint so any
// photo the owner can see in the dashboard is fair game for the poster
// (approved or pending — the owner moderates anyway).

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Printer,
  ImageIcon,
  Loader2,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocale } from "@/hooks/use-locale";

interface Photo {
  id: number;
  url: string;
  guestName: string | null;
  guestMessage: string | null;
  createdAt: string;
}

interface Plan {
  id: number;
  title: string;
  eventDate: string | null;
}

type Layout = "grid" | "polaroid" | "magazine";

const LAYOUTS: Array<{ key: Layout; labelKey: string; descriptionKey: string }> = [
  {
    key: "grid",
    labelKey: "cabinet.collage.layouts.grid.label",
    descriptionKey: "cabinet.collage.layouts.grid.description",
  },
  {
    key: "polaroid",
    labelKey: "cabinet.collage.layouts.polaroid.label",
    descriptionKey: "cabinet.collage.layouts.polaroid.description",
  },
  {
    key: "magazine",
    labelKey: "cabinet.collage.layouts.magazine.label",
    descriptionKey: "cabinet.collage.layouts.magazine.description",
  },
];

export function ColajClient({ planId }: { planId: number }) {
  const { t } = useLocale();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [layout, setLayout] = useState<Layout>("grid");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [photosRes, planRes] = await Promise.all([
          fetch(`/api/event-plans/${planId}/photos`, { cache: "no-store" }),
          fetch(`/api/event-plans/${planId}`, { cache: "no-store" }),
        ]);
        if (!alive) return;
        if (photosRes.ok) {
          const data = await photosRes.json();
          setPhotos(Array.isArray(data?.photos) ? data.photos : []);
        }
        if (planRes.ok) {
          const data = await planRes.json();
          if (data?.plan) {
            setPlan({
              id: data.plan.id,
              title: data.plan.title,
              eventDate: data.plan.eventDate,
            });
          }
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [planId]);

  // Stable per-photo rotation for the polaroid layout. Re-rolling on
  // every render would jitter the page; keep it deterministic per id
  // so the print preview stays consistent across re-renders.
  const rotations = useMemo(() => {
    const map = new Map<number, number>();
    for (const p of photos) {
      // -7..7 degrees feels playful without looking broken on print.
      const hash = (p.id * 9301 + 49297) % 233280;
      map.set(p.id, (hash / 233280) * 14 - 7);
    }
    return map;
  }, [photos]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  const dateLabel = plan?.eventDate
    ? new Date(plan.eventDate + "T00:00:00").toLocaleDateString("ro-MD", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
      {/* Toolbar — hidden when printing. */}
      <div className="print-hide mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/cabinet/moments/${planId}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-gold"
        >
          <ArrowLeft className="h-3 w-3" /> {t("cabinet.collage.backToGallery")}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={layout}
            onChange={(e) => setLayout(e.target.value as Layout)}
            className="rounded-lg border border-border/40 bg-background px-3 py-2 text-sm focus:border-gold focus:outline-none"
          >
            {LAYOUTS.map((l) => (
              <option key={l.key} value={l.key}>
                {t(l.labelKey)}
              </option>
            ))}
          </select>
          <button
            onClick={() => window.print()}
            disabled={photos.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-gold px-4 py-2 text-sm font-medium text-[#0D0D0D] hover:bg-gold-dark disabled:opacity-50"
          >
            <Printer className="h-4 w-4" /> {t("cabinet.collage.print")}
          </button>
        </div>
      </div>

      <p className="print-hide mb-4 text-xs text-muted-foreground">
        {(() => {
          const active = LAYOUTS.find((l) => l.key === layout);
          return active ? t(active.descriptionKey) : null;
        })()}{" "}
        <span className="ml-1 text-gold">
          {t("cabinet.collage.printHint")}
        </span>
      </p>

      {photos.length === 0 ? (
        <div className="print-hide rounded-2xl border border-dashed border-border/40 p-10 text-center">
          <ImageIcon className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 font-medium">{t("cabinet.collage.emptyTitle")}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("cabinet.collage.emptyText")}
          </p>
        </div>
      ) : (
        <article
          className={cn(
            "collage-sheet relative rounded-2xl border border-border/40 bg-card p-6 shadow-sm print:border-0 print:shadow-none print:rounded-none",
            layout === "polaroid" && "bg-[#F8F4EA] print:bg-[#F8F4EA]",
          )}
        >
          {/* Heading — present on both screen and print. */}
          <header className="mb-6 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-[5px] text-gold">
              Photo Moments
            </p>
            <h1 className="mt-2 font-heading text-3xl font-bold tracking-tight md:text-4xl">
              {plan?.title}
            </h1>
            {dateLabel && (
              <p className="mt-1 text-sm text-muted-foreground">{dateLabel}</p>
            )}
          </header>

          {layout === "grid" && (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-4 print:grid-cols-4 print:gap-1">
              {photos.map((p) => (

                <img
                  key={p.id}
                  src={p.url}
                  alt={p.guestName ?? ""}
                  loading="lazy"
                  className="aspect-square w-full rounded-md object-cover ring-1 ring-gold/20 print:rounded-none print:ring-0"
                />
              ))}
            </div>
          )}

          {layout === "polaroid" && (
            <div className="flex flex-wrap justify-center gap-x-3 gap-y-6 print:gap-x-2 print:gap-y-4">
              {photos.map((p) => {
                const rot = rotations.get(p.id) ?? 0;
                return (
                  <figure
                    key={p.id}
                    className="bg-white p-2 pb-8 shadow-md print:shadow-none print:p-1.5 print:pb-6"
                    style={{
                      transform: `rotate(${rot.toFixed(2)}deg)`,
                      width: "min(180px, 24%)",
                    }}
                  >
                    { }
                    <img
                      src={p.url}
                      alt={p.guestName ?? ""}
                      loading="lazy"
                      className="aspect-square w-full object-cover"
                    />
                    {p.guestName && (
                      <figcaption className="mt-1 text-center font-handwriting text-[11px] text-black/70 print:text-[10px]">
                        {p.guestName}
                      </figcaption>
                    )}
                  </figure>
                );
              })}
            </div>
          )}

          {layout === "magazine" && (
            <div className="columns-2 gap-2 sm:columns-3 md:columns-4 print:columns-4 print:gap-1">
              {photos.map((p, i) => {
                // Mix of aspect ratios so the masonry feels editorial.
                // Every 5th photo goes "portrait" tall, every 3rd goes
                // square, the rest landscape.
                const tall = i % 5 === 0;
                const square = i % 3 === 0 && !tall;
                return (
                  <div key={p.id} className="mb-2 break-inside-avoid print:mb-1">
                    { }
                    <img
                      src={p.url}
                      alt={p.guestName ?? ""}
                      loading="lazy"
                      className={cn(
                        "w-full rounded-md object-cover ring-1 ring-gold/15 print:rounded-none print:ring-0",
                        tall && "aspect-[3/4]",
                        square && "aspect-square",
                        !tall && !square && "aspect-[4/3]",
                      )}
                    />
                  </div>
                );
              })}
            </div>
          )}

          {/* Footer credit — appears on print so the wedding receives
              a discreet branding cue when they share the PDF. */}
          <footer className="mt-6 pt-4 text-center text-[10px] uppercase tracking-[3px] text-muted-foreground print:text-[9px]">
            <Sparkles className="inline h-3 w-3 text-gold" />{" "}
            {t("cabinet.collage.memoriesCredit", { count: photos.length })}
          </footer>
        </article>
      )}

      {/* Print stripping + .font-handwriting live in globals.css. The
          parent cabinet layout wraps content in .cabinet-shell which
          those rules target. */}
    </div>
  );
}
