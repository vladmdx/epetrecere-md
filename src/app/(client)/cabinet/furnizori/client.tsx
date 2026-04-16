"use client";

// F-C9 — Lista furnizorilor (artiști + săli) pe care clientul i-a contactat
// sau rezervat. Un singur rând pentru fiecare furnizor, cu cel mai recent
// status agregat din booking_requests și offer_requests.

import { useEffect, useState } from "react";
import Link from "next/link";
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
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Vendor {
  kind: "artist" | "venue";
  id: number;
  name: string;
  slug: string | null;
  status: string;
  eventDate: string | null;
  eventType: string | null;
  source: "booking_request" | "offer_request";
  createdAt: string;
}

const statusLabels: Record<string, { label: string; cls: string }> = {
  pending: { label: "În așteptare", cls: "bg-warning/15 text-warning" },
  accepted: { label: "Acceptat — confirmă", cls: "bg-gold/15 text-gold" },
  confirmed_by_client: {
    label: "Confirmat",
    cls: "bg-success/15 text-success",
  },
  rejected: { label: "Refuzat", cls: "bg-destructive/15 text-destructive" },
  cancelled: { label: "Anulat", cls: "bg-muted text-muted-foreground" },
  new: { label: "Cerere trimisă", cls: "bg-muted text-muted-foreground" },
  seen: { label: "Văzut", cls: "bg-muted text-muted-foreground" },
  processed: { label: "Procesat", cls: "bg-success/15 text-success" },
};

export function FurnizoriClient() {
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
          Autentifică-te pentru a vedea furnizorii tăi
        </h1>
        <Link
          href="/sign-in?redirect_url=/cabinet/furnizori"
          className="mt-6 inline-flex items-center justify-center rounded-lg bg-gold px-4 py-2 text-sm font-medium text-background hover:bg-gold-dark"
        >
          Autentifică-te
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
        <ArrowLeft className="h-3 w-3" /> Înapoi la cabinet
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-[3px] text-gold">
            Echipa ta
          </p>
          <h1 className="font-heading text-2xl font-bold md:text-3xl">
            Furnizorii mei
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Toți artiștii și sălile cu care ai luat legătura pentru eveniment.
          </p>
        </div>
        <Link
          href="/artisti"
          className="inline-flex items-center gap-2 rounded-lg border border-gold/40 bg-gold/5 px-4 py-2 text-sm font-medium text-gold hover:bg-gold/10"
        >
          <Plus className="h-4 w-4" /> Adaugă furnizor
        </Link>
      </div>

      {vendors.length > 0 && (
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <StatBox label="Total furnizori" value={vendors.length} />
          <StatBox label="Confirmați" value={confirmedCount} accent />
          <StatBox label="În așteptare" value={pendingCount} />
        </div>
      )}

      {vendors.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-border/40 p-12 text-center">
          <p className="text-sm text-muted-foreground">
            Nu ai contactat niciun furnizor încă.
          </p>
          <Link
            href="/artisti"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-gold px-4 py-2 text-sm font-medium text-background hover:bg-gold-dark"
          >
            Explorează catalogul
          </Link>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {vendors.map((v) => {
            const status = statusLabels[v.status] ?? statusLabels.new;
            const publicPath =
              v.slug &&
              (v.kind === "artist" ? `/artisti/${v.slug}` : `/sali/${v.slug}`);
            return (
              <Card key={`${v.kind}-${v.id}`}>
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
                          {v.name}
                        </h3>
                        <Badge className={`text-xs ${status.cls}`}>
                          {status.label}
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
                        <ExternalLink className="h-3 w-3" /> Profil
                      </Link>
                    )}
                    <Link
                      href="/cabinet?tab=conversations"
                      className="inline-flex items-center gap-1 rounded-md border border-border/60 px-3 py-1.5 text-xs font-medium hover:bg-muted"
                    >
                      <MessageSquare className="h-3 w-3" /> Mesaje
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
