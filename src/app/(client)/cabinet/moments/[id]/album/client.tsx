"use client";

// Phase 5/D1 — Album builder.
//
// Pages produced (in order):
//   1. Cover            (title + date + photo count + decoration)
//   2..N. Grid pages    (3x3 = 9 photos per page; captions if present)
//   Final. Thanks page  (alphabetical list of every guest who contributed)
//
// Each page is constrained to A4 portrait (210 × 297 mm). The print
// CSS in globals.css strips the cabinet chrome on print so the PDF
// owner downloads looks exactly like the on-screen preview.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Printer, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Photo {
  id: number;
  url: string;
  guestName: string | null;
  caption: string | null;
  prompt: string | null;
  createdAt: string;
}

interface Plan {
  title: string;
  eventDate: string | null;
}

const PHOTOS_PER_PAGE = 9;

export function AlbumClient({ planId }: { planId: number }) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  useEffect(() => {
    const alive = true;
    (async () => {
      try {
        const [planRes, photosRes] = await Promise.all([
          fetch(`/api/event-plans/${planId}`, { cache: "no-store" }),
          fetch(`/api/event-plans/${planId}/photos`, { cache: "no-store" }),
        ]);
        if (!alive) return;
        const pj = planRes.ok ? await planRes.json() : null;
        if (pj?.plan) {
          setPlan({ title: pj.plan.title, eventDate: pj.plan.eventDate });
        }
        if (photosRes.ok) {
          const j = await photosRes.json();
          const list = (Array.isArray(j?.photos) ? j.photos : []) as Array<
            Photo & { isFavorite?: boolean; isApproved?: boolean }
          >;
          // Only include approved photos in the album — pending stuff
          // shouldn't ship in a deliverable.
          const approved = list.filter((p) => p.isApproved !== false);
          setPhotos(approved);
        }
      } catch {
        toast.error("Nu am putut încărca albumul");
      } finally {
        if (alive) setLoading(false);
      }
    })();
  }, [planId]);

  const dateLabel = useMemo(() => {
    if (!plan?.eventDate) return null;
    return new Date(plan.eventDate + "T00:00:00").toLocaleDateString("ro-MD", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }, [plan?.eventDate]);

  // Optionally filter to favorites only — useful when the owner wants
  // a curated 20-page book instead of the full firehose.
  const filtered = useMemo(() => {
    if (!favoritesOnly) return photos;
    const favs = photos.filter((p) =>
      // We don't pull isFavorite into the typed Photo above so the
      // server may or may not send it; treat it permissively.
      Boolean((p as unknown as { isFavorite?: boolean }).isFavorite),
    );
    return favs.length > 0 ? favs : photos; // graceful fallback
  }, [favoritesOnly, photos]);

  const pages = useMemo(() => {
    const out: Photo[][] = [];
    for (let i = 0; i < filtered.length; i += PHOTOS_PER_PAGE) {
      out.push(filtered.slice(i, i + PHOTOS_PER_PAGE));
    }
    return out;
  }, [filtered]);

  // Alphabetical list of unique guest names for the thanks page.
  const guests = useMemo(() => {
    const set = new Set<string>();
    for (const p of filtered) {
      const name = p.guestName?.trim();
      if (name) set.add(name);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "ro-MD"));
  }, [filtered]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <p className="text-sm text-muted-foreground">
          Nu există încă poze aprobate pentru album.
        </p>
        <Link
          href={`/cabinet/moments/${planId}`}
          className="mt-4 inline-block text-sm text-gold hover:underline"
        >
          ← Înapoi la galerie
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 lg:px-8">
      <div className="print-hide mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/cabinet/moments/${planId}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-gold"
        >
          <ArrowLeft className="h-3 w-3" /> Înapoi la galerie
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={favoritesOnly}
              onChange={(e) => setFavoritesOnly(e.target.checked)}
              className="h-3.5 w-3.5 accent-gold"
            />
            Doar favorite (⭐)
          </label>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg bg-gold px-4 py-2 text-sm font-medium text-[#0D0D0D] hover:bg-gold-dark"
          >
            <Printer className="h-4 w-4" /> Tipărește / Salvează PDF
          </button>
        </div>
      </div>
      <p className="print-hide mb-4 text-xs text-muted-foreground">
        {filtered.length} poze · {pages.length + 2} pagini A4. Folosește
        File → Print → Save as PDF, format A4 portrait.
      </p>

      {/* COVER */}
      <article
        className="collage-sheet album-page mx-auto flex flex-col items-center justify-center bg-[#FAF8F2] text-black"
        style={{ width: "210mm", minHeight: "297mm", padding: "24mm" }}
      >
        <div className="text-center">
          <p
            className="text-[12px] font-semibold uppercase tracking-[8px]"
            style={{ color: "#C9A84C" }}
          >
            Photo Moments
          </p>
          <div className="my-8 h-px w-32 mx-auto" style={{ background: "#C9A84C" }} />
          <h1
            className="font-heading text-5xl font-bold leading-tight"
            style={{ color: "#0D0D0D" }}
          >
            {plan?.title}
          </h1>
          {dateLabel && (
            <p className="mt-4 text-lg" style={{ color: "#4A4A52" }}>
              {dateLabel}
            </p>
          )}
          <div className="my-10 h-px w-32 mx-auto" style={{ background: "#C9A84C" }} />
          <p className="text-sm" style={{ color: "#4A4A52" }}>
            {filtered.length} amintiri colectate de invitați
          </p>
          <p
            className="mt-12 text-[10px] uppercase tracking-[4px]"
            style={{ color: "#C9A84C" }}
          >
            ePetrecere.md
          </p>
        </div>
      </article>

      {/* GRID PAGES */}
      {pages.map((page, pi) => (
        <article
          key={pi}
          className="collage-sheet album-page mx-auto mt-6 bg-white text-black"
          style={{ width: "210mm", minHeight: "297mm", padding: "14mm" }}
        >
          <header className="mb-3 flex items-center justify-between text-[10px] uppercase tracking-[3px] text-black/50">
            <span>{plan?.title}</span>
            <span>
              Pagina {pi + 1} / {pages.length}
            </span>
          </header>
          <div className="grid grid-cols-3 gap-2">
            {page.map((photo) => (
              <figure key={photo.id} className="flex flex-col">
                { }
                <img
                  src={photo.url}
                  alt={photo.guestName ?? ""}
                  loading="lazy"
                  className="aspect-square w-full rounded-sm object-cover ring-1 ring-black/10"
                />
                <figcaption className="mt-1 min-h-[20px] px-0.5 text-[8px] leading-tight text-black/70">
                  {photo.caption ? (
                    <span className="italic">&ldquo;{photo.caption}&rdquo;</span>
                  ) : photo.prompt ? (
                    <span className="uppercase tracking-wider text-[7px] text-gold-dark">
                      {photo.prompt}
                    </span>
                  ) : photo.guestName ? (
                    <span className="font-medium">{photo.guestName}</span>
                  ) : null}
                </figcaption>
              </figure>
            ))}
          </div>
        </article>
      ))}

      {/* THANKS PAGE */}
      <article
        className="collage-sheet album-page mx-auto mt-6 bg-[#FAF8F2] text-black"
        style={{ width: "210mm", minHeight: "297mm", padding: "24mm" }}
      >
        <div className="text-center">
          <p
            className="text-[10px] font-semibold uppercase tracking-[6px]"
            style={{ color: "#C9A84C" }}
          >
            Mulțumiri
          </p>
          <h2
            className="mt-4 font-heading text-3xl font-bold"
            style={{ color: "#0D0D0D" }}
          >
            Mulțumim invitaților care au împărtășit aceste momente
          </h2>
          <div
            className="my-8 h-px w-32 mx-auto"
            style={{ background: "#C9A84C" }}
          />
        </div>
        {guests.length > 0 ? (
          <div className="mx-auto mt-4 grid max-w-3xl grid-cols-2 gap-x-8 gap-y-1 text-[14px] text-black/80 sm:grid-cols-3">
            {guests.map((name) => (
              <p key={name} className="text-center">
                {name}
              </p>
            ))}
          </div>
        ) : (
          <p className="text-center text-sm text-black/60">
            (Pozele anonime nu au fost atribuite)
          </p>
        )}
        <p
          className="mt-16 text-center text-[10px] uppercase tracking-[4px]"
          style={{ color: "#C9A84C" }}
        >
          ePetrecere.md · Photo Moments
        </p>
      </article>

      {/* Page-break rules: force a new sheet between each .album-page
          when printing so cover, grids, and thanks land on separate
          physical pages. */}
      <style>{`
        @media print {
          .album-page {
            page-break-after: always;
            break-after: page;
            margin: 0 !important;
          }
          .album-page:last-of-type {
            page-break-after: auto;
          }
        }
      `}</style>
    </div>
  );
}
