"use client";

// F-C9 — Lista furnizorilor (artiști + săli) pe care clientul i-a contactat
// sau rezervat. Un singur rând pentru fiecare furnizor, cu cel mai recent
// status agregat din booking_requests și offer_requests.

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useUser } from "@clerk/nextjs";
import {
  ArrowLeft,
  ExternalLink,
  Loader2,
  MessageSquare,
  Music,
  Building2,
  Calendar,
  Plus,
  PlayCircle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/hooks/use-locale";
import { getLocalized } from "@/i18n";

interface Vendor {
  kind: "artist" | "venue";
  id: number;
  nameRo: string;
  nameRu: string | null;
  nameEn: string | null;
  slug: string | null;
  imageUrl: string;
  videoUrl: string | null;
  status: string;
  eventDate: string | null;
  eventType: string | null;
  source: "booking_request" | "offer_request";
  createdAt: string;
}

const statusLabels: Record<string, { labelKey: string; cls: string }> = {
  pending: { labelKey: "cabinet.vendors.status.pending", cls: "bg-warning/15 text-warning" },
  accepted: { labelKey: "cabinet.vendors.status.accepted", cls: "bg-gold/15 text-gold" },
  confirmed_by_client: {
    labelKey: "cabinet.vendors.status.confirmed",
    cls: "bg-success/15 text-success",
  },
  rejected: { labelKey: "cabinet.vendors.status.rejected", cls: "bg-destructive/15 text-destructive" },
  cancelled: { labelKey: "cabinet.vendors.status.cancelled", cls: "bg-muted text-muted-foreground" },
  new: { labelKey: "cabinet.vendors.status.new", cls: "bg-muted text-muted-foreground" },
  seen: { labelKey: "cabinet.vendors.status.seen", cls: "bg-muted text-muted-foreground" },
  processed: { labelKey: "cabinet.vendors.status.processed", cls: "bg-success/15 text-success" },
};

export function FurnizoriClient() {
  const { locale, t } = useLocale();
  const { isLoaded, isSignedIn } = useUser();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    fetch("/api/me/furnizori")
      .then((r) => (r.ok ? r.json() : { vendors: [] }))
      .then((data) => setVendors(data.vendors ?? []))
      .catch(() => setVendors([]))
      .finally(() => setLoading(false));
  }, [isLoaded, isSignedIn]);

  if (!isLoaded || loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-12 lg:px-8">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center lg:px-8">
        <h1 className="font-heading text-2xl font-bold">
          {t("cabinet.vendors.signInTitle")}
        </h1>
        <Link
          href="/sign-in?redirect_url=/cabinet/furnizori"
          className="mt-6 inline-flex items-center justify-center rounded-lg bg-gold px-4 py-2 text-sm font-medium text-[#0D0D0D] hover:bg-gold-dark"
        >
          {t("cabinet.vendors.signInCta")}
        </Link>
      </div>
    );
  }

  const confirmedCount = vendors.filter(
    (v) => v.status === "confirmed_by_client" || v.status === "processed",
  ).length;
  const pendingCount = vendors.filter(
    (v) => v.status === "pending" || v.status === "new" || v.status === "seen",
  ).length;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 lg:px-8">
      <Link
        href="/cabinet"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-gold"
      >
        <ArrowLeft className="h-3 w-3" /> {t("cabinet.vendors.backToCabinet")}
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-[3px] text-gold">
            {t("cabinet.vendors.eyebrow")}
          </p>
          <h1 className="font-heading text-2xl font-bold md:text-3xl">
            {t("cabinet.vendors.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("cabinet.vendors.subtitle")}
          </p>
        </div>
        <Link
          href="/artisti"
          className="inline-flex items-center gap-2 rounded-lg border border-gold/40 bg-gold/5 px-4 py-2 text-sm font-medium text-gold hover:bg-gold/10"
        >
          <Plus className="h-4 w-4" /> {t("cabinet.vendors.addVendor")}
        </Link>
      </div>

      {vendors.length > 0 && (
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <StatBox label={t("cabinet.vendors.statTotal")} value={vendors.length} />
          <StatBox label={t("cabinet.vendors.statConfirmed")} value={confirmedCount} accent />
          <StatBox label={t("cabinet.vendors.statPending")} value={pendingCount} />
        </div>
      )}

      {vendors.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-border/40 p-12 text-center">
          <p className="text-sm text-muted-foreground">
            {t("cabinet.vendors.emptyText")}
          </p>
          <Link
            href="/artisti"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-gold px-4 py-2 text-sm font-medium text-[#0D0D0D] hover:bg-gold-dark"
          >
            {t("cabinet.vendors.exploreCatalog")}
          </Link>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {vendors.map((v) => {
            const status = statusLabels[v.status] ?? statusLabels.new;
            const name = getLocalized(v, "name", locale);
            const publicPath =
              v.slug &&
              (v.kind === "artist" ? `/artisti/${v.slug}` : `/sali/${v.slug}`);
            return (
              <Card key={`${v.kind}-${v.id}`} className="overflow-hidden">
                <div className="relative aspect-[16/7] bg-muted">
                  <Image
                    src={v.imageUrl}
                    alt={name}
                    fill
                    sizes="(max-width: 768px) 100vw, 50vw"
                    className="object-cover"
                    unoptimized
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
                  <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full border border-white/20 bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur">
                    {v.kind === "artist" ? (
                      <Music className="h-3 w-3" />
                    ) : (
                      <Building2 className="h-3 w-3" />
                    )}
                    {v.kind === "artist" ? t("cabinet.vendors.kindArtist") : t("cabinet.vendors.kindVenue")}
                  </span>
                  {v.videoUrl && (
                    <a
                      href={v.videoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-gold px-3 py-1.5 text-xs font-semibold text-[#0D0D0D] shadow-lg hover:bg-gold-dark"
                    >
                      <PlayCircle className="h-4 w-4" /> {t("cabinet.vendors.video")}
                    </a>
                  )}
                </div>
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <div className="rounded-lg bg-gold/10 p-2 text-gold">
                      {v.kind === "artist" ? (
                        <Music className="h-5 w-5" />
                      ) : (
                        <Building2 className="h-5 w-5" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate font-heading font-bold">
                          {name}
                        </h3>
                        <Badge className={`text-xs ${status.cls}`}>
                          {t(status.labelKey)}
                        </Badge>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        {v.eventType && <span>{v.eventType}</span>}
                        {v.eventDate && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" /> {v.eventDate}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {publicPath && (
                      <Link
                        href={publicPath}
                        target="_blank"
                        rel="noopener"
                        className="inline-flex items-center gap-1 rounded-md border border-border/60 px-3 py-1.5 text-xs font-medium hover:bg-muted"
                      >
                        <ExternalLink className="h-3 w-3" /> {t("cabinet.vendors.profile")}
                      </Link>
                    )}
                    <Link
                      href="/cabinet?tab=conversations"
                      className="inline-flex items-center gap-1 rounded-md border border-border/60 px-3 py-1.5 text-xs font-medium hover:bg-muted"
                    >
                      <MessageSquare className="h-3 w-3" /> {t("cabinet.vendors.messages")}
                    </Link>
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

function StatBox({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        accent ? "border-gold/30 bg-gold/5" : "border-border/40 bg-card"
      }`}
    >
      <p className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-accent text-2xl font-bold">{value}</p>
    </div>
  );
}
