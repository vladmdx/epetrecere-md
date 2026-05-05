"use client";

// Multi-event planner index — lists the user's active plans and sends them
// to the full 7-step wizard at /planifica when they want to create a new
// event. The old single-screen dialog was replaced so every entry point
// (homepage "Planifică Eveniment" header button, this list) uses the same
// flow. The wizard submits wizard-data to sessionStorage and the results
// page materializes it into a real event plan.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Plus,
  Loader2,
  Sparkles,
  Heart,
  Calendar as CalendarIcon,
  MapPin,
  Users,
  ArrowRight,
  Trash2,
} from "lucide-react";

const EVENT_TYPE_LABELS: Record<string, string> = {
  wedding: "Nuntă",
  baptism: "Botez",
  cumatrie: "Cumătrie",
  birthday: "Zi de naștere",
  corporate: "Corporate",
  other: "Alt tip",
};

interface PlanListItem {
  id: number;
  title: string;
  eventType: string | null;
  eventDate: string | null;
  location: string | null;
  guestCountTarget: number | null;
  budgetTarget: number | null;
}

function startFreshWizard() {
  // Clear any stale wizard data so the user sees a blank 7-step form.
  sessionStorage.removeItem("wizard-data");
  sessionStorage.removeItem("wizard-plan-id");
}

export default function PlannerIndexPage() {
  const { isSignedIn, isLoaded } = useUser();
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<PlanListItem[]>([]);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setLoading(false);
      return;
    }
    fetch("/api/event-plans?status=active", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { plans: [] }))
      .then((data) => {
        setPlans(data.plans ?? []);
      })
      .catch(() => setPlans([]))
      .finally(() => setLoading(false));
  }, [isLoaded, isSignedIn]);

  // Inline plan delete — exposed on every card so phone users don't have
  // to drill into /cabinet/planifica/[id] → Setări tab to remove a plan.
  // The Setări-tab delete still works; this just adds a mobile-friendly
  // entry point without changing any server-side behavior.
  async function handleDelete(planId: number, planTitle: string) {
    if (
      !confirm(
        `Ștergi definitiv planul "${planTitle}"? Acțiunea nu poate fi anulată.`,
      )
    ) {
      return;
    }
    setDeletingId(planId);
    try {
      const res = await fetch(`/api/event-plans/${planId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        toast.error("Nu am putut șterge planul.");
        return;
      }
      setPlans((prev) => prev.filter((p) => p.id !== planId));
      toast.success("Planul a fost șters.");
    } catch {
      toast.error("Eroare la ștergere.");
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) {
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
        <h1 className="font-heading text-xl font-bold">Planifică evenimentul</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Autentifică-te pentru a crea planul tău de eveniment.
        </p>
        <Link
          href="/sign-in"
          className="mt-4 inline-block rounded-xl bg-gold px-4 py-2 text-sm font-medium text-[#0D0D0D] hover:bg-gold-dark"
        >
          Autentificare
        </Link>
      </div>
    );
  }

  // Empty state — no plans yet.
  if (plans.length === 0) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <Sparkles className="mx-auto mb-4 h-12 w-12 text-gold/60" />
        <h1 className="font-heading text-xl font-bold">
          Începe planificarea evenimentului
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
          Treci prin cei 7 pași — alegi tipul evenimentului, data, sala,
          artiștii și bugetul, apoi primești imediat o listă de furnizori
          liberi pentru data ta.
        </p>
        <Link href="/planifica" onClick={startFreshWizard}>
          <Button className="mt-6 gap-2 bg-gold text-[#0D0D0D] hover:bg-gold-dark">
            <Plus className="h-4 w-4" /> Planifică Eveniment
          </Button>
        </Link>
      </div>
    );
  }

  // Plan list.
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">Evenimentele mele</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {plans.length} plan{plans.length === 1 ? "" : "uri"} active
          </p>
        </div>
        <Link href="/planifica" onClick={startFreshWizard}>
          <Button className="gap-2 bg-gold text-[#0D0D0D] hover:bg-gold-dark">
            <Plus className="h-4 w-4" /> Planifică Eveniment
          </Button>
        </Link>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {plans.map((p) => {
          const eventLabel = p.eventType
            ? EVENT_TYPE_LABELS[p.eventType] ?? p.eventType
            : null;
          const isDeleting = deletingId === p.id;
          return (
            <div
              key={p.id}
              className="group relative rounded-xl border border-border/40 bg-card p-5 transition-all hover:border-gold/40 hover:shadow-lg"
            >
              <Link
                href={`/cabinet/planifica/${p.id}`}
                className="block"
              >
                <div className="flex items-start justify-between gap-3 pr-10">
                  <div className="flex-1 min-w-0">
                    <h2 className="font-heading text-lg font-semibold truncate">
                      {p.title}
                    </h2>
                    {eventLabel && (
                      <span className="mt-1 inline-block rounded-full border border-gold/30 bg-gold/5 px-2 py-0.5 text-[11px] text-gold">
                        {eventLabel}
                      </span>
                    )}
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
              <button
                type="button"
                onClick={() => void handleDelete(p.id, p.title)}
                disabled={isDeleting}
                aria-label="Șterge planul"
                className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg border border-destructive/30 text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
              >
                {isDeleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
