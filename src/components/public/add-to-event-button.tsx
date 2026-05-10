"use client";

// CTA on the public artist (and venue) detail pages that funnels the
// visitor into one of their event plans. Replaces the old static Link
// to /cabinet — that link did nothing useful for users who weren't
// signed in or who hadn't created a plan yet.
//
// Behavior tiers:
//   1. Anonymous visitor → bounce to /sign-in with a redirect_url.
//   2. Partner viewing a public profile → render nothing (booking
//      yourself doesn't make sense and the API would 403 anyway).
//   3. Signed-in client with 0 active plans → take them straight to
//      the /planifica wizard so they can create one.
//   4. Signed-in client with 1+ plans → ALWAYS open the picker so the
//      user can see conflict status (we used to skip the dialog when
//      there was only one plan, hiding the conflict signal). The
//      picker shows each plan's date and tags any plan where the
//      artist is already booked as "ocupat" — that plan can't be
//      selected. A "Eveniment nou" button at the bottom opens the
//      wizard.
//
// The page that lands them on /cabinet/planifica/[id]?tab=bookings
// has its own per-category booking grid; this component just routes.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { CalendarDays, Loader2, Plus, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PlanListItem {
  id: number;
  title: string;
  eventType: string | null;
  eventDate: string | null;
  startTime?: string | null;
  endTime?: string | null;
}

interface PlanConflictInfo {
  planId: number;
  /** true → artist already has a blocking booking on plan.eventDate. */
  conflict: boolean;
  /** true → couldn't determine, treat as available. */
  unknown?: boolean;
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
  artistId,
  artistSlug,
  presetEventPlanId,
}: Props) {
  const router = useRouter();
  const { isSignedIn, isLoaded } = useUser();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [plans, setPlans] = useState<PlanListItem[] | null>(null);
  const [conflicts, setConflicts] = useState<Record<number, PlanConflictInfo>>(
    {},
  );
  // Hide the CTA for partner accounts — booking yourself doesn't make
  // sense and the API would reject the request anyway.
  const [isPartner, setIsPartner] = useState(false);

  useEffect(() => {
    if (!isSignedIn) {
      setIsPartner(false);
      return;
    }
    let alive = true;
    fetch("/api/auth/check-role", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!alive || !data) return;
        if (data.role === "artist" || data.role === "venue") {
          setIsPartner(true);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [isSignedIn]);

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

  /** For each plan with an eventDate, hit /api/artist-availability and
   *  decide whether the artist is busy that day. Empty/no-date plans are
   *  treated as available (unknown). Failures default to available so
   *  we don't false-block the user from booking. */
  async function loadConflicts(list: PlanListItem[]) {
    const datedPlans = list.filter((p) => !!p.eventDate);
    if (datedPlans.length === 0) {
      setConflicts({});
      return;
    }
    const results = await Promise.all(
      datedPlans.map(async (p) => {
        try {
          const res = await fetch(
            `/api/artist-availability?artist_id=${artistId}&date=${p.eventDate}`,
            { cache: "no-store" },
          );
          if (!res.ok) {
            return {
              planId: p.id,
              conflict: false,
              unknown: true,
            } as PlanConflictInfo;
          }
          const data = (await res.json()) as {
            bookedRanges?: Array<{ startTime: string; endTime: string }>;
            wholeDayBlocked?: boolean;
          };
          // Whole-day block beats time-window check.
          if (data.wholeDayBlocked) {
            return { planId: p.id, conflict: true } as PlanConflictInfo;
          }
          const ranges = data.bookedRanges ?? [];
          if (ranges.length === 0) {
            return { planId: p.id, conflict: false } as PlanConflictInfo;
          }
          // If the plan has its own time window, look for an overlap.
          // Otherwise any booked range on the day blocks this plan since
          // the artist could already be on a gig at the same hour.
          const planStart = p.startTime || "00:00";
          const planEnd = p.endTime || "23:59";
          const overlap = ranges.some(
            (r) => r.startTime < planEnd && r.endTime > planStart,
          );
          return {
            planId: p.id,
            conflict: overlap,
          } as PlanConflictInfo;
        } catch {
          return {
            planId: p.id,
            conflict: false,
            unknown: true,
          } as PlanConflictInfo;
        }
      }),
    );
    const map: Record<number, PlanConflictInfo> = {};
    for (const r of results) map[r.planId] = r;
    setConflicts(map);
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
    setPlans(list);
    if (list.length === 0) {
      // No plans — start a new one. The wizard creates the plan and
      // lands them on /cabinet/planifica/[newId]?tab=bookings.
      setLoading(false);
      router.push("/planifica");
      return;
    }
    // Always show the dialog (even for a single plan) so conflict info
    // is visible and the user can opt to spin up another event.
    await loadConflicts(list);
    setLoading(false);
    setOpen(true);
  }

  // Resolve plans + conflicts once the dialog opens (defensive — onClick
  // already pre-warmed both, but keeps the dialog usable on a subsequent
  // open after plans were created elsewhere).
  useEffect(() => {
    if (!open) return;
    if (plans && plans.length > 0 && Object.keys(conflicts).length === 0) {
      void loadConflicts(plans);
    }
    if (plans === null) {
      void (async () => {
        setLoading(true);
        const list = await fetchPlans();
        setPlans(list);
        await loadConflicts(list);
        setLoading(false);
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function selectPlan(planId: number) {
    setOpen(false);
    router.push(`/cabinet/planifica/${planId}?tab=bookings`);
  }

  function newEvent() {
    setOpen(false);
    // Send the artist target along with the wizard so we can auto-create
    // a booking once the plan is ready. The /auth-redirect → from-wizard
    // flow already handles the session-storage hand-off.
    try {
      sessionStorage.setItem(
        "auto-book-after-plan",
        JSON.stringify({ artistId, artistSlug }),
      );
    } catch {
      /* ignore */
    }
    router.push("/planifica");
  }

  const sortedPlans = useMemo(() => {
    if (!plans) return [] as PlanListItem[];
    // Plans with a date (the conflict signal is meaningful) first, then
    // dateless ones. Within each group, soonest first so the most
    // imminent event is on top.
    return [...plans].sort((a, b) => {
      if (a.eventDate && !b.eventDate) return -1;
      if (!a.eventDate && b.eventDate) return 1;
      if (a.eventDate && b.eventDate)
        return a.eventDate.localeCompare(b.eventDate);
      return 0;
    });
  }, [plans]);

  // Partner viewing a public profile — show nothing instead of a button
  // that the API would reject. The rest of the page (gallery, reviews)
  // still works for browsing competitors.
  if (isPartner) return null;

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
            Alege evenimentul tău. Evenimentele unde partenerul este deja
            ocupat sunt marcate corespunzător.
          </p>
          <div className="mt-2 space-y-2">
            {sortedPlans.map((p) => {
              const info = conflicts[p.id];
              const isConflicted = !!info?.conflict;
              const dateLabel = p.eventDate
                ? new Date(p.eventDate + "T00:00:00").toLocaleDateString(
                    "ro-MD",
                    { day: "numeric", month: "long", year: "numeric" },
                  )
                : "Fără dată stabilită";
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={isConflicted}
                  onClick={() => selectPlan(p.id)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                    isConflicted
                      ? "border-red-500/30 bg-red-500/5 cursor-not-allowed opacity-70"
                      : "border-border/40 bg-card/60 hover:border-gold/40",
                  )}
                >
                  <div
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-md",
                      isConflicted
                        ? "bg-red-500/10 text-red-400"
                        : "bg-gold/10 text-gold",
                    )}
                  >
                    {isConflicted ? (
                      <AlertTriangle className="h-4 w-4" />
                    ) : (
                      <CalendarDays className="h-4 w-4" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{p.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {dateLabel}
                    </p>
                    {isConflicted && (
                      <p className="mt-1 text-xs font-medium text-red-400">
                        Ocupat — partenerul are deja o rezervare în această
                        zi.
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="mt-4 border-t border-border/30 pt-3">
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={newEvent}
            >
              <Plus className="h-4 w-4" /> Eveniment nou
            </Button>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Creezi evenimentul în câteva secunde — apoi îți trimitem
              cererea către acest partener automat.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
