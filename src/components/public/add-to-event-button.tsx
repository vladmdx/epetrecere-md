"use client";

// CTA on the public artist (and venue) detail pages that funnels the
// visitor into one of their event plans. Replaces the old static Link
// to /cabinet — that link did nothing useful for users who weren't
// signed in or who hadn't created a plan yet.
//
// Behavior tiers:
//   1. Anonymous visitor → bounce to /sign-in with a redirect_url.
//   2. Signed-in user with 0 active plans → take them straight to the
//      /planifica wizard so they can create one.
//   3. Signed-in user with 1 plan → jump directly to that plan's
//      Rezervări Artiști tab.
//   4. Signed-in user with 2+ plans → show a small dialog so they pick
//      which plan they want this artist on.
//
// The page that lands them on /cabinet/planifica/[id]?tab=bookings
// has its own per-category booking grid; this component just routes.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { CalendarDays, Loader2, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface PlanListItem {
  id: number;
  title: string;
  eventType: string | null;
  eventDate: string | null;
}

interface Props {
  artistId: number;
  artistSlug: string;
  /** When the user came here via a /cabinet/planifica/[id] deep-link
   *  the parent already knows which plan to target. We honour that and
   *  skip the picker entirely. */
  presetEventPlanId: number | null;
}

export function AddToEventButton({
  artistId: _artistId,
  artistSlug,
  presetEventPlanId,
}: Props) {
  void _artistId; // reserved for future API hookup
  const router = useRouter();
  const { isSignedIn, isLoaded } = useUser();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [plans, setPlans] = useState<PlanListItem[] | null>(null);

  // Lazy-load the plan list only on first click — saves an /api call
  // on every artist page render for casual browsers.
  async function fetchPlans(): Promise<PlanListItem[]> {
    const res = await fetch("/api/event-plans?status=active", {
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.plans) ? data.plans : [];
  }

  // If we already have a deep-link plan id, the click is a fast path.
  async function onClick() {
    if (!isLoaded) return;
    if (!isSignedIn) {
      // Stash where to come back to after sign-in.
      try {
        sessionStorage.setItem(
          "next-url",
          `/cabinet/planifica?artistSlug=${encodeURIComponent(artistSlug)}`,
        );
      } catch {
        /* ignore */
      }
      router.push(
        `/sign-in?redirect_url=${encodeURIComponent(`/artisti/${artistSlug}`)}`,
      );
      return;
    }
    if (presetEventPlanId) {
      router.push(`/cabinet/planifica/${presetEventPlanId}?tab=bookings`);
      return;
    }
    setLoading(true);
    const list = await fetchPlans();
    setLoading(false);
    setPlans(list);
    if (list.length === 0) {
      // No plans — start a new one. The wizard creates the plan and
      // lands them on /cabinet/planifica/[newId]?tab=bookings.
      router.push("/planifica");
      return;
    }
    if (list.length === 1) {
      router.push(`/cabinet/planifica/${list[0].id}?tab=bookings`);
      return;
    }
    setOpen(true);
  }

  // Resolve plans once the dialog opens so the radio list renders.
  useEffect(() => {
    if (open && plans === null) {
      void (async () => {
        setLoading(true);
        setPlans(await fetchPlans());
        setLoading(false);
      })();
    }
  }, [open, plans]);

  return (
    <>
      <button
        type="button"
        onClick={() => void onClick()}
        disabled={!isLoaded || loading}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-gold px-4 py-3 font-heading text-sm font-semibold text-[#0D0D0D] transition-colors hover:bg-gold-dark disabled:opacity-50"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <CalendarDays className="h-4 w-4" />
        )}
        {presetEventPlanId
          ? "Rezervă pentru evenimentul tău"
          : "Adaugă la un eveniment"}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Alege evenimentul</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Pentru care dintre evenimentele tale vrei să rezervi acest
            partener?
          </p>
          <div className="mt-2 space-y-2">
            {plans?.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setOpen(false);
                  router.push(`/cabinet/planifica/${p.id}?tab=bookings`);
                }}
                className="flex w-full items-start gap-3 rounded-lg border border-border/40 bg-card/60 p-3 text-left hover:border-gold/40"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gold/10 text-gold">
                  <CalendarDays className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.eventDate
                      ? new Date(p.eventDate + "T00:00:00").toLocaleDateString(
                          "ro-MD",
                          { day: "numeric", month: "long", year: "numeric" },
                        )
                      : "Fără dată stabilită"}
                  </p>
                </div>
              </button>
            ))}
          </div>
          <div className="mt-4 border-t border-border/30 pt-3">
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={() => {
                setOpen(false);
                router.push("/planifica");
              }}
            >
              <Plus className="h-4 w-4" /> Eveniment nou
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
