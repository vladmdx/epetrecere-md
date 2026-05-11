"use client";

// Photo Moments hub.
//
// Two entry paths land here:
//   1) The signed-in client clicks "Momente Eveniment" in the sidebar, or
//      the /utilitati/momente-eveniment CTA bounces them in.
//   2) The signed-in client deep-links from anywhere else.
//
// What you see depends on what plans you already have:
//   - **0 plans** → a friendly empty state with the standalone "Creează
//     o galerie nouă" form (just a title — we make a film-only plan).
//   - **1+ plans** → a grid of every plan, badge-coded by whether
//     Photo Moments is already active. Clicking a plan goes to
//     /cabinet/moments/{id} where they can activate / manage it. The
//     standalone form is always available below.
//
// The standalone flow exists so people who don't want to plan a full
// event (e.g. they just want a QR for a birthday tonight) can spin up
// a film in 5 seconds without wading through the wizard. Internally
// it's still an event_plan row — just one with `momentsEnabled=true`
// and no other tabs activated.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { Camera, Loader2, Plus, QrCode, ChevronRight } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

interface Plan {
  id: number;
  title: string;
  eventDate: string | null;
  momentsEnabled: boolean;
  momentsSlug: string | null;
}

export default function MomentsHubPage() {
  const { isSignedIn, isLoaded } = useUser();
  const router = useRouter();
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [loading, setLoading] = useState(true);

  // New-film form state. We intentionally keep the form tiny — just a
  // title; the user can fill date / guest count later if they want to
  // graduate the film into a full event plan.
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      router.replace("/sign-in?redirect_url=/cabinet/moments");
      return;
    }
    let alive = true;
    fetch("/api/event-plans", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { plans: [] }))
      .then((data) => {
        if (!alive) return;
        const list = (data.plans ?? []) as Plan[];
        setPlans(list);
        setLoading(false);
      })
      .catch(() => {
        if (alive) {
          setPlans([]);
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [isLoaded, isSignedIn, router]);

  async function handleCreateStandalone() {
    const title = newTitle.trim();
    if (title.length < 2) {
      toast.error("Adaugă un nume pentru galerie (minim 2 caractere).");
      return;
    }
    setCreating(true);
    try {
      // Single POST with momentsEnabled:true — the server flips the
      // flag and generates a slug in one go. No second activation
      // call needed.
      const res = await fetch("/api/event-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, momentsEnabled: true }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Nu am putut crea galeria.");
      }
      const payload = await res.json();
      const planId = payload?.plan?.id;
      if (!planId) throw new Error("Răspuns invalid de la server.");
      toast.success("Galerie creată!");
      router.push(`/cabinet/moments/${planId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Eroare la creare");
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  const enabled = (plans ?? []).filter((p) => p.momentsEnabled);
  const disabled = (plans ?? []).filter((p) => !p.momentsEnabled);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 lg:px-8">
      <header className="mb-8">
        <p className="text-xs font-medium uppercase tracking-[3px] text-gold">
          Photo Moments
        </p>
        <h1 className="mt-1 font-heading text-2xl font-bold md:text-3xl">
          Galeriile tale foto
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Creează o galerie QR pentru un eveniment existent sau una de sine
          stătătoare (fără să planifici un eveniment întreg).
        </p>
      </header>

      {/* Standalone create — always visible so the action is one click away. */}
      <section className="rounded-2xl border border-gold/30 bg-gold/5 p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gold/15 text-gold">
            <QrCode className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-heading text-lg font-bold">
              Creează o galerie nouă (fără eveniment)
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Pentru o petrecere de moment, o aniversare improvizată sau un
              eveniment corporate scurt. Dă-i doar un nume; primești QR-ul în
              câteva secunde.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleCreateStandalone();
              }}
              className="mt-4 flex flex-col gap-2 sm:flex-row"
            >
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Ex: Aniversare Ana 30 ani"
                maxLength={120}
                className="flex-1 rounded-lg border border-border/40 bg-background px-3 py-2.5 text-sm focus:border-gold focus:outline-none"
              />
              <button
                type="submit"
                disabled={creating || newTitle.trim().length < 2}
                className="flex items-center justify-center gap-2 rounded-lg bg-gold px-4 py-2.5 text-sm font-medium text-[#0D0D0D] hover:bg-gold-dark disabled:cursor-not-allowed disabled:opacity-50"
              >
                {creating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Creează galerie
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* Active galleries — quick access to the ones the user already
          has running. Skipped entirely when there's nothing to show. */}
      {enabled.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 font-heading text-lg font-bold">
            Galerii active ({enabled.length})
          </h2>
          <ul className="space-y-2">
            {enabled.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/cabinet/moments/${p.id}`}
                  className="flex items-center gap-3 rounded-xl border border-border/40 bg-card p-4 transition-colors hover:border-gold/40"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gold/15 text-gold">
                    <Camera className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{p.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.eventDate
                        ? new Date(p.eventDate + "T00:00:00").toLocaleDateString(
                            "ro-MD",
                            { day: "numeric", month: "long", year: "numeric" },
                          )
                        : "Fără dată"}{" "}
                      · QR activ
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Plans without Photo Moments yet — one-click activation by
          jumping into their per-plan moments page. */}
      {disabled.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 font-heading text-lg font-bold">
            Sau activeaz-o pentru un eveniment existent
          </h2>
          <ul className="space-y-2">
            {disabled.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/cabinet/moments/${p.id}`}
                  className="flex items-center gap-3 rounded-xl border border-dashed border-border/40 p-4 transition-colors hover:border-gold/40 hover:bg-card/40"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <Camera className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{p.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.eventDate
                        ? new Date(p.eventDate + "T00:00:00").toLocaleDateString(
                            "ro-MD",
                            { day: "numeric", month: "long", year: "numeric" },
                          )
                        : "Fără dată"}{" "}
                      · Click pentru activare
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* True empty state — never had any plans. Just a friendly nudge. */}
      {plans !== null && plans.length === 0 && (
        <p className="mt-10 rounded-xl border border-dashed border-border/40 p-6 text-center text-sm text-muted-foreground">
          Nu ai încă nicio galerie. Creează una mai sus în câteva secunde.
        </p>
      )}
    </div>
  );
}
