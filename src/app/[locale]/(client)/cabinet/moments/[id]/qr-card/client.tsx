"use client";

// Phase 5/C2 — printable QR card builder.
//
// Owner picks a template (classic / romantic / modern), the page
// renders the card with the QR + event title + date + decoration.
// The print stylesheet in globals.css strips cabinet chrome so
// File → Print → Save as PDF produces a clean A6 sheet ready to put
// on tables.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Printer, Loader2 } from "lucide-react";
import QRCode from "qrcode";
import { cn } from "@/lib/utils";

type Template = "classic" | "romantic" | "modern";

const TEMPLATES: Array<{ key: Template; label: string; description: string }> = [
  {
    key: "classic",
    label: "Classic gold",
    description: "Ramă aurie subțire pe fundal crem. Discret, elegant.",
  },
  {
    key: "romantic",
    label: "Romantic floral",
    description: "Motive florale gold + cursive — perfect pentru nuntă.",
  },
  {
    key: "modern",
    label: "Modern geometric",
    description: "Linii curate, contrast înalt. Pentru evenimente corporate.",
  },
];

interface Plan {
  title: string;
  eventDate: string | null;
  slug: string | null;
  enabled: boolean;
}

export function QrCardClient({ planId }: { planId: number }) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [template, setTemplate] = useState<Template>("classic");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

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
        if (!planData?.plan) return;
        setPlan({
          title: planData.plan.title,
          eventDate: planData.plan.eventDate,
          slug: momentsData?.slug ?? null,
          enabled: momentsData?.enabled ?? false,
        });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [planId]);

  // Generate the QR with bigger margin/size than the in-dashboard
  // preview — a printed card needs more pixels to scan reliably from
  // 1m+ away.
  useEffect(() => {
    if (!plan?.slug) {
      setQrDataUrl(null);
      return;
    }
    const origin =
      typeof window !== "undefined"
        ? window.location.origin
        : "https://epetrecere.md";
    const url = `${origin}/moments/${plan.slug}`;
    QRCode.toDataURL(url, {
      width: 600,
      margin: 2,
      color: { dark: "#0D0D0D", light: "#FFFFFF" },
    })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [plan?.slug]);

  const dateLabel = useMemo(() => {
    if (!plan?.eventDate) return null;
    return new Date(plan.eventDate + "T00:00:00").toLocaleDateString("ro-MD", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }, [plan?.eventDate]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  if (!plan?.slug || !plan.enabled) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <p className="text-sm text-muted-foreground">
          Activează mai întâi galeria Photo Moments ca să poți tipări
          cardul cu QR.
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
    <div className="mx-auto max-w-4xl px-4 py-8 lg:px-8">
      {/* Toolbar — stripped from the printed page. */}
      <div className="print-hide mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/cabinet/moments/${planId}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-gold"
        >
          <ArrowLeft className="h-3 w-3" /> Înapoi la galerie
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={template}
            onChange={(e) => setTemplate(e.target.value as Template)}
            className="rounded-lg border border-border/40 bg-background px-3 py-2 text-sm focus:border-gold focus:outline-none"
          >
            {TEMPLATES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => window.print()}
            disabled={!qrDataUrl}
            className="inline-flex items-center gap-2 rounded-lg bg-gold px-4 py-2 text-sm font-medium text-[#0D0D0D] hover:bg-gold-dark disabled:opacity-50"
          >
            <Printer className="h-4 w-4" /> Tipărește / Salvează PDF
          </button>
        </div>
      </div>

      <p className="print-hide mb-4 text-xs text-muted-foreground">
        {TEMPLATES.find((t) => t.key === template)?.description}{" "}
        <span className="ml-1 text-gold">
          File → Print → Save as PDF, format A6 portrait.
        </span>
      </p>

      {/* The card itself. Sized for A6 (105 × 148 mm) so the printed
          sheet matches the screen preview 1:1. */}
      <div className="flex justify-center">
        <article
          className={cn(
            "collage-sheet relative flex flex-col items-center justify-between text-center",
            "print:shadow-none print:border-0",
          )}
          style={{
            width: "105mm",
            height: "148mm",
            padding: "8mm",
            ...templateStyle(template).sheet,
          }}
        >
          {/* Decorative top frame */}
          <DecorTop template={template} />

          {/* Header text */}
          <div className="z-10 mt-2 flex flex-col items-center">
            <p
              className="text-[10px] font-medium uppercase tracking-[6px]"
              style={{ color: templateStyle(template).accent }}
            >
              Photo Moments
            </p>
            <h1
              className="mt-2 text-2xl font-bold leading-tight"
              style={{
                fontFamily: templateStyle(template).headingFamily,
                color: templateStyle(template).heading,
              }}
            >
              {plan.title}
            </h1>
            {dateLabel && (
              <p
                className="mt-1 text-xs"
                style={{ color: templateStyle(template).body }}
              >
                {dateLabel}
              </p>
            )}
          </div>

          {/* QR */}
          {qrDataUrl && (
            <div className="z-10 my-2 rounded-lg bg-white p-2 shadow-sm">
              { }
              <img
                src={qrDataUrl}
                alt="QR pentru upload poze"
                style={{ width: "55mm", height: "55mm", display: "block" }}
              />
            </div>
          )}

          {/* Instructions */}
          <div
            className="z-10 mb-2 flex flex-col items-center"
            style={{ color: templateStyle(template).body }}
          >
            <p className="text-sm font-semibold">Scanează codul</p>
            <p className="mt-0.5 text-xs">
              Împărtășește pozele tale instant — fără cont, fără aplicație.
            </p>
            <p
              className="mt-2 text-[10px] uppercase tracking-[3px]"
              style={{ color: templateStyle(template).accent }}
            >
              ePetrecere.md
            </p>
          </div>

          {/* Decorative bottom frame */}
          <DecorBottom template={template} />
        </article>
      </div>
    </div>
  );
}

/** Style preset per template. Returned shape is consumed inline so we
 *  can avoid Tailwind dynamic class limitations on print colours. */
function templateStyle(t: Template): {
  sheet: React.CSSProperties;
  accent: string;
  heading: string;
  body: string;
  headingFamily: string;
} {
  switch (t) {
    case "romantic":
      return {
        sheet: {
          background:
            "linear-gradient(135deg, #FAF4E8 0%, #F5E6CC 100%)",
          border: "1mm solid #C9A84C",
          borderRadius: "3mm",
        },
        accent: "#C9A84C",
        heading: "#5C2A2A",
        body: "#6B4423",
        headingFamily: '"Caveat", "Comic Sans MS", cursive',
      };
    case "modern":
      return {
        sheet: {
          background: "#0D0D0D",
          border: "0.5mm solid #C9A84C",
          color: "#FAF8F2",
        },
        accent: "#C9A84C",
        heading: "#FAF8F2",
        body: "#B0B0C0",
        headingFamily: '"DM Sans", system-ui, sans-serif',
      };
    case "classic":
    default:
      return {
        sheet: {
          background: "#FAF8F2",
          border: "0.8mm double #C9A84C",
          borderRadius: "2mm",
        },
        accent: "#C9A84C",
        heading: "#0D0D0D",
        body: "#4A4A52",
        headingFamily: '"Playfair Display", "DM Sans", serif',
      };
  }
}

/** Decorative ornament rendered above the heading. SVG so it prints
 *  crisp at any zoom level. */
function DecorTop({ template }: { template: Template }) {
  const color = templateStyle(template).accent;
  if (template === "romantic") {
    return (
      <svg width="40mm" height="10mm" viewBox="0 0 200 50" className="z-10">
        <path
          d="M100 10 C 80 0 60 20 50 30 M100 10 C 120 0 140 20 150 30"
          stroke={color}
          strokeWidth="1.5"
          fill="none"
          strokeLinecap="round"
        />
        <circle cx="100" cy="15" r="3" fill={color} />
        <circle cx="80" cy="22" r="2" fill={color} />
        <circle cx="120" cy="22" r="2" fill={color} />
      </svg>
    );
  }
  if (template === "modern") {
    return (
      <svg width="40mm" height="6mm" viewBox="0 0 200 30" className="z-10">
        <line x1="20" y1="15" x2="90" y2="15" stroke={color} strokeWidth="2" />
        <circle cx="100" cy="15" r="4" fill={color} />
        <line x1="110" y1="15" x2="180" y2="15" stroke={color} strokeWidth="2" />
      </svg>
    );
  }
  // classic — twin laurel
  return (
    <svg width="36mm" height="6mm" viewBox="0 0 200 30" className="z-10">
      <line x1="10" y1="15" x2="80" y2="15" stroke={color} strokeWidth="1" />
      <text
        x="100"
        y="22"
        textAnchor="middle"
        fontSize="22"
        fill={color}
        fontFamily="serif"
      >
        ⚜
      </text>
      <line x1="120" y1="15" x2="190" y2="15" stroke={color} strokeWidth="1" />
    </svg>
  );
}

function DecorBottom({ template }: { template: Template }) {
  const color = templateStyle(template).accent;
  if (template === "romantic") {
    return (
      <svg width="50mm" height="8mm" viewBox="0 0 200 40" className="z-10">
        <path
          d="M 20 20 Q 60 0 100 20 T 180 20"
          stroke={color}
          strokeWidth="1.5"
          fill="none"
        />
      </svg>
    );
  }
  if (template === "modern") {
    return (
      <svg width="30mm" height="2mm" viewBox="0 0 200 10" className="z-10">
        <rect x="0" y="3" width="200" height="2" fill={color} />
      </svg>
    );
  }
  return (
    <svg width="30mm" height="3mm" viewBox="0 0 200 15" className="z-10">
      <line x1="0" y1="7" x2="200" y2="7" stroke={color} strokeWidth="0.8" />
    </svg>
  );
}
