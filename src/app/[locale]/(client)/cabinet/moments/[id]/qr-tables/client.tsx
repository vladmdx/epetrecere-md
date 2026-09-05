"use client";

// Phase 5/C3 — Per-table QR sheet.
//
// Owner declares N table labels in settings; this page generates one
// QR per label, each scoped to /moments/[slug]?t=<label>. Cards are
// packed 3 per row at A4-portrait so a single print produces 12 cards
// per page (4 rows × 3). Reuses the print stylesheet from Phase 2.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Printer, Loader2 } from "lucide-react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { useLocale } from "@/hooks/use-locale";

interface State {
  title: string;
  eventDate: string | null;
  slug: string | null;
  tables: string[];
  accessCode: string | null;
}

export function QrTablesClient({ planId }: { planId: number }) {
  const { t } = useLocale();
  const [state, setState] = useState<State | null>(null);
  const [loading, setLoading] = useState(true);
  const [qrByLabel, setQrByLabel] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [planRes, momentsRes] = await Promise.all([
          fetch(`/api/event-plans/${planId}`, { cache: "no-store" }),
          fetch(`/api/event-plans/${planId}/moments`, { cache: "no-store" }),
        ]);
        if (!alive) return;
        const planData = planRes.ok ? await planRes.json() : null;
        const momentsData = momentsRes.ok ? await momentsRes.json() : null;
        if (!planData?.plan || !momentsData) return;
        setState({
          title: planData.plan.title,
          eventDate: planData.plan.eventDate,
          slug: momentsData.slug,
          tables: Array.isArray(momentsData.tables) ? momentsData.tables : [],
          accessCode: momentsData.accessCode ?? null,
        });
      } catch {
        toast.error(t("cabinet.qrTables.loadError"));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [planId]);

  // Generate QR per label in parallel once we have slug + list.
  useEffect(() => {
    if (!state?.slug || state.tables.length === 0) {
      setQrByLabel({});
      return;
    }
    const origin =
      typeof window !== "undefined"
        ? window.location.origin
        : "https://epetrecere.md";
    Promise.all(
      state.tables.map(async (label) => {
        const url = `${origin}/moments/${state.slug}?t=${encodeURIComponent(label)}`;
        const dataUrl = await QRCode.toDataURL(url, {
          width: 360,
          margin: 1,
          color: { dark: "#0D0D0D", light: "#FFFFFF" },
        });
        return [label, dataUrl] as const;
      }),
    )
      .then((rows) => setQrByLabel(Object.fromEntries(rows)))
      .catch(() => setQrByLabel({}));
  }, [state]);

  const dateLabel = useMemo(() => {
    if (!state?.eventDate) return null;
    return new Date(state.eventDate + "T00:00:00").toLocaleDateString("ro-MD", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }, [state?.eventDate]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  if (!state?.slug) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <p className="text-sm text-muted-foreground">
          {t("cabinet.qrTables.enableGalleryFirst")}
        </p>
        <Link
          href={`/cabinet/moments/${planId}`}
          className="mt-4 inline-block text-sm text-gold hover:underline"
        >
          {t("cabinet.qrTables.backToGalleryArrow")}
        </Link>
      </div>
    );
  }

  if (state.tables.length === 0) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <p className="text-sm text-muted-foreground">
          {t("cabinet.qrTables.addTablesFirst")}
        </p>
        <Link
          href={`/cabinet/moments/${planId}`}
          className="mt-4 inline-block text-sm text-gold hover:underline"
        >
          {t("cabinet.qrTables.backToGalleryArrow")}
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
          <ArrowLeft className="h-3 w-3" /> {t("cabinet.qrTables.backToGallery")}
        </Link>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-lg bg-gold px-4 py-2 text-sm font-medium text-[#0D0D0D] hover:bg-gold-dark"
        >
          <Printer className="h-4 w-4" /> {t("cabinet.qrTables.print")}
        </button>
      </div>

      <p className="print-hide mb-4 text-xs text-muted-foreground">
        {t("cabinet.qrTables.cardsHint", { count: state.tables.length })}
      </p>

      <article className="collage-sheet rounded-2xl border border-border/40 bg-card p-6 print:border-0 print:bg-white">
        <header className="mb-6 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[5px] text-gold">
            {t("cabinet.qrTables.sheetTitle")}
          </p>
          <h1 className="mt-1 font-heading text-2xl font-bold">
            {state.title}
          </h1>
          {dateLabel && (
            <p className="mt-1 text-xs text-muted-foreground">{dateLabel}</p>
          )}
        </header>

        <div className="grid grid-cols-3 gap-3 print:gap-2">
          {state.tables.map((label) => {
            const qr = qrByLabel[label];
            return (
              <div
                key={label}
                className="flex flex-col items-center rounded-xl border border-gold/30 bg-[#FAF8F2] p-3 text-center text-black print:border print:border-dashed print:border-gold/40 print:rounded-none"
              >
                <p
                  className="text-[10px] font-semibold uppercase tracking-[3px]"
                  style={{ color: "#C9A84C" }}
                >
                  Moments
                </p>
                <p className="mt-1 font-heading text-base font-bold leading-tight">
                  {label}
                </p>
                {qr ? (

                  <img
                    src={qr}
                    alt={`QR ${label}`}
                    className="mt-2 h-auto w-full max-w-[140px]"
                  />
                ) : (
                  <div className="mt-2 flex h-[140px] w-[140px] items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-gold" />
                  </div>
                )}
                <p className="mt-1 text-[9px] text-black/60">
                  {t("cabinet.qrTables.scanHint")}
                </p>
                {state.accessCode ? (
                  <p className="mt-1 text-[10px] font-bold tracking-[0.18em] text-[#9c7721]">PIN {state.accessCode}</p>
                ) : null}
              </div>
            );
          })}
        </div>

        <footer className="mt-6 text-center text-[10px] uppercase tracking-[3px] text-muted-foreground print:text-[9px]">
          ePetrecere.md · Photo Moments
        </footer>
      </article>
    </div>
  );
}
