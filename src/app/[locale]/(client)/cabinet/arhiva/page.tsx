"use client";

// Arhivă Evenimente — read-only list of plans whose status is "completed"
// or "cancelled". Sidebar only links here if the user actually has
// finished plans; an empty state still renders gracefully for deep links.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import {
  Archive,
  Calendar as CalendarIcon,
  MapPin,
  Users,
  Loader2,
  ArrowRight,
  Heart,
} from "lucide-react";

interface ArchivedPlan {
  id: number;
  title: string;
  eventType: string | null;
  eventDate: string | null;
  location: string | null;
  guestCountTarget: number | null;
  status: "completed" | "cancelled" | "active";
  archivedAt: string | null;
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  wedding: "Nuntă",
  baptism: "Botez",
  cumatrie: "Cumătrie",
  birthday: "Zi de naștere",
  corporate: "Corporate",
  other: "Alt tip",
};

export default function ArchivePage() {
  const { isSignedIn, isLoaded } = useUser();
  const [plans, setPlans] = useState<ArchivedPlan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      setLoading(false);
      return;
    }
    // Fetch both completed and cancelled in parallel — neither are shown on
    // the main /cabinet/planifica list, so this page is their only entry point.
    Promise.all([
      fetch("/api/event-plans?status=completed", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : { plans: [] }))
        .catch(() => ({ plans: [] })),
      fetch("/api/event-plans?status=cancelled", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : { plans: [] }))
        .catch(() => ({ plans: [] })),
    ])
      .then(([completed, cancelled]) => {
        setPlans([...(completed.plans ?? []), ...(cancelled.plans ?? [])]);
      })
      .finally(() => setLoading(false));
  }, [isLoaded, isSignedIn]);

  if (!isLoaded || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <Heart className="mx-auto mb-4 h-12 w-12 text-gold/40" />
        <p className="mt-2 text-sm text-muted-foreground">
          Autentifică-te pentru a vedea arhiva.
        </p>
      </div>
    );
  }

  if (plans.length === 0) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <Archive className="mx-auto mb-4 h-12 w-12 text-gold/40" />
        <h1 className="font-heading text-xl font-bold">Arhiva este goală</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Aici vor apărea evenimentele tale după ce le marchezi ca finalizate.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-center gap-3">
        <Archive className="h-6 w-6 text-gold" />
        <div>
          <h1 className="font-heading text-2xl font-bold">Arhivă Evenimente</h1>
          <p className="text-sm text-muted-foreground">
            {plans.length} eveniment{plans.length === 1 ? "" : "e"} finalizate
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {plans.map((p) => {
          const eventLabel = p.eventType
            ? EVENT_TYPE_LABELS[p.eventType] ?? p.eventType
            : null;
          return (
            <Link
              key={p.id}
              href={`/cabinet/planifica/${p.id}`}
              className="group rounded-xl border border-border/30 bg-card/60 p-5 opacity-80 transition-all hover:border-gold/30 hover:opacity-100"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h2 className="font-heading text-lg font-semibold truncate">
                    {p.title}
                  </h2>
                  <div className="mt-1 flex items-center gap-2">
                    {eventLabel && (
                      <span className="inline-block rounded-full border border-border/40 bg-muted/30 px-2 py-0.5 text-[11px] text-muted-foreground">
                        {eventLabel}
                      </span>
                    )}
                    <span
                      className={`inline-block rounded-full border px-2 py-0.5 text-[11px] ${
                        p.status === "completed"
                          ? "border-success/30 bg-success/5 text-success"
                          : "border-destructive/30 bg-destructive/5 text-destructive"
                      }`}
                    >
                      {p.status === "completed" ? "Finalizat" : "Anulat"}
                    </span>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-gold" />
              </div>

              <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {p.eventDate && (
                  <span className="flex items-center gap-1">
                    <CalendarIcon className="h-3 w-3" />
                    {new Date(p.eventDate).toLocaleDateString("ro-MD", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </span>
                )}
                {p.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {p.location}
                  </span>
                )}
                {p.guestCountTarget && (
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {p.guestCountTarget} invitați
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
