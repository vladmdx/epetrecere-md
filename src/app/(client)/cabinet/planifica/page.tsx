"use client";

// M4 — Client cabinet: Planner index — visual step-by-step event planning
// dashboard. Shows planning phases with progress indicators, quick links
// to each sub-section, and the create-plan dialog.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Plus,
  Calendar,
  Users,
  Wallet,
  MapPin,
  Loader2,
  ClipboardList,
  CheckCircle2,
  Circle,
  Music,
  UtensilsCrossed,
  Camera,
  Heart,
  Sparkles,
  ArrowRight,
  Settings,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface EventPlan {
  id: number;
  title: string;
  eventType: string | null;
  eventDate: string | null;
  location: string | null;
  guestCountTarget: number | null;
  budgetTarget: number | null;
  createdAt: string;
}

interface PlanStats {
  checklistTotal: number;
  checklistDone: number;
  guestCount: number;
  tableCount: number;
}

const EVENT_TYPES: { value: string; label: string }[] = [
  { value: "wedding", label: "Nuntă" },
  { value: "baptism", label: "Botez" },
  { value: "cumatrie", label: "Cumătrie" },
  { value: "birthday", label: "Zi de naștere" },
  { value: "corporate", label: "Corporate" },
  { value: "other", label: "Alt tip" },
];

const EVENT_TYPE_LABELS: Record<string, string> = {
  wedding: "Nuntă",
  baptism: "Botez",
  cumatrie: "Cumătrie",
  birthday: "Zi de naștere",
  corporate: "Corporate",
  other: "Alt tip",
};

// Planning phases for the visual timeline
function getPlanningPhases(plan: EventPlan, stats: PlanStats) {
  const hasDate = !!plan.eventDate;
  const hasLocation = !!plan.location;
  const hasBudget = !!plan.budgetTarget;
  const hasGuests = !!plan.guestCountTarget;
  const phase1Done = hasDate && hasLocation && hasBudget;

  const checklistProgress =
    stats.checklistTotal > 0
      ? Math.round((stats.checklistDone / stats.checklistTotal) * 100)
      : 0;

  const guestProgress =
    plan.guestCountTarget && stats.guestCount > 0
      ? Math.min(100, Math.round((stats.guestCount / plan.guestCountTarget) * 100))
      : stats.guestCount > 0
        ? 50
        : 0;

  return [
    {
      id: "setup",
      icon: Settings,
      title: "Definește Evenimentul",
      description: "Data, locația, bugetul și tipul evenimentului",
      progress: [hasDate, hasLocation, hasBudget, hasGuests].filter(Boolean).length * 25,
      status: phase1Done ? ("done" as const) : ("active" as const),
      href: `/cabinet/planifica/${plan.id}`,
      details: [
        { label: "Data", value: plan.eventDate ? new Date(plan.eventDate).toLocaleDateString("ro-MD", { day: "numeric", month: "long", year: "numeric" }) : "Nesetată", done: hasDate },
        { label: "Locația", value: plan.location || "Nesetată", done: hasLocation },
        { label: "Buget", value: plan.budgetTarget ? `${plan.budgetTarget}€` : "Nesetat", done: hasBudget },
        { label: "Invitați", value: plan.guestCountTarget ? `${plan.guestCountTarget} estimați` : "Nesetat", done: hasGuests },
      ],
    },
    {
      id: "checklist",
      icon: ClipboardList,
      title: "Checklist & Sarcini",
      description: `${stats.checklistDone}/${stats.checklistTotal} sarcini completate`,
      progress: checklistProgress,
      status: checklistProgress === 100 ? ("done" as const) : stats.checklistTotal > 0 ? ("active" as const) : ("upcoming" as const),
      href: `/cabinet/planifica/${plan.id}`,
    },
    {
      id: "vendors",
      icon: Music,
      title: "Alege Furnizori",
      description: "Artiști, DJ, foto-video, decorațiuni",
      progress: 0,
      status: "active" as const,
      href: "/artisti",
      external: true,
    },
    {
      id: "guests",
      icon: Users,
      title: "Lista de Invitați",
      description: stats.guestCount > 0
        ? `${stats.guestCount} invitați adăugați`
        : "Adaugă invitații la eveniment",
      progress: guestProgress,
      status: stats.guestCount > 0 ? ("active" as const) : ("upcoming" as const),
      href: `/cabinet/planifica/${plan.id}`,
    },
    {
      id: "seating",
      icon: UtensilsCrossed,
      title: "Așezare la Mese",
      description: stats.tableCount > 0
        ? `${stats.tableCount} mese configurate`
        : "Planifică așezarea invitaților",
      progress: stats.tableCount > 0 ? 50 : 0,
      status: stats.tableCount > 0 ? ("active" as const) : ("upcoming" as const),
      href: `/cabinet/planifica/${plan.id}`,
    },
    {
      id: "photos",
      icon: Camera,
      title: "Momente & Fotografii",
      description: "Galeria foto live cu QR code",
      progress: 0,
      status: "upcoming" as const,
      href: `/cabinet/moments`,
    },
  ];
}

export default function PlannerIndexPage() {
  const { isSignedIn, isLoaded } = useUser();
  const [plans, setPlans] = useState<EventPlan[]>([]);
  const [planStats, setPlanStats] = useState<Record<number, PlanStats>>({});
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  // Create form state
  const [title, setTitle] = useState("");
  const [eventType, setEventType] = useState<string>("wedding");
  const [eventDate, setEventDate] = useState("");
  const [location, setLocation] = useState("");
  const [guestCount, setGuestCount] = useState("");
  const [budget, setBudget] = useState("");
  const [notes, setNotes] = useState("");

  async function loadPlans() {
    setLoading(true);
    try {
      const res = await fetch("/api/event-plans", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const plansList: EventPlan[] = data.plans ?? [];
      setPlans(plansList);

      // Load stats for each plan
      const statsMap: Record<number, PlanStats> = {};
      await Promise.all(
        plansList.map(async (p) => {
          try {
            const r = await fetch(`/api/event-plans/${p.id}`, { cache: "no-store" });
            if (r.ok) {
              const d = await r.json();
              const checklist = d.checklist ?? [];
              statsMap[p.id] = {
                checklistTotal: checklist.length,
                checklistDone: checklist.filter((c: { done: boolean }) => c.done).length,
                guestCount: (d.guests ?? []).length,
                tableCount: (d.tables ?? []).length,
              };
            }
          } catch {
            statsMap[p.id] = { checklistTotal: 0, checklistDone: 0, guestCount: 0, tableCount: 0 };
          }
        }),
      );
      setPlanStats(statsMap);
    } catch {
      toast.error("Nu s-au putut încărca planurile.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isLoaded && isSignedIn) loadPlans();
    else if (isLoaded) setLoading(false);
  }, [isLoaded, isSignedIn]);

  async function handleCreate() {
    if (title.trim().length < 2) {
      toast.error("Dă un nume planului.");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/event-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          eventType: eventType || undefined,
          eventDate: eventDate || undefined,
          location: location || undefined,
          guestCountTarget: guestCount ? Number(guestCount) : undefined,
          budgetTarget: budget ? Number(budget) : undefined,
          notes: notes || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Eroare la creare.");
        return;
      }
      toast.success("Plan creat — checklist-ul a fost pregătit automat.");
      setOpen(false);
      setTitle("");
      setEventType("wedding");
      setEventDate("");
      setLocation("");
      setGuestCount("");
      setBudget("");
      setNotes("");
      await loadPlans();
    } catch {
      toast.error("Eroare la creare.");
    } finally {
      setCreating(false);
    }
  }

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="mx-auto max-w-md py-20 px-4 text-center">
        <ClipboardList className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
        <h1 className="font-heading text-xl font-bold">Planifică evenimentul</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Autentifică-te pentru a-ți crea checklist, listă de invitați și harta de mese.
        </p>
        <div className="mt-4">
          <Link
            href="/sign-in"
            className="inline-block rounded-xl bg-gold px-4 py-2 text-sm font-medium text-background hover:bg-gold-dark"
          >
            Autentificare
          </Link>
        </div>
      </div>
    );
  }

  // If user has plans, show the main plan dashboard
  const activePlan = plans.length > 0 ? plans[0] : null;
  const stats = activePlan ? planStats[activePlan.id] : null;

  return (
    <div className="mx-auto max-w-4xl">
      {/* Header */}
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold flex items-center gap-2">
            <Heart className="h-6 w-6 text-gold" />
            Planificator Eveniment
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Organizează totul pas cu pas — checklist, invitați, furnizori și mese.
          </p>
        </div>
        <Button
          onClick={() => setOpen(true)}
          className="gap-1 bg-gold text-background hover:bg-gold-dark"
        >
          <Plus className="h-4 w-4" /> Plan nou
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Se încarcă…
        </div>
      ) : !activePlan ? (
        /* Empty state */
        <div className="rounded-2xl border border-dashed border-gold/30 bg-gold/5 py-16 text-center">
          <Sparkles className="mx-auto mb-4 h-12 w-12 text-gold/60" />
          <h2 className="font-heading text-xl font-bold">
            Începe planificarea evenimentului
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            Creează primul tău plan — vei primi automat un checklist potrivit
            pentru tipul evenimentului, cu sarcini, termene și notificări.
          </p>
          <Button
            onClick={() => setOpen(true)}
            className="mt-6 gap-2 bg-gold text-background hover:bg-gold-dark"
          >
            <Plus className="h-4 w-4" /> Creează plan
          </Button>
        </div>
      ) : (
        <>
          {/* Active Plan Header Card */}
          <Card className="mb-6 border-gold/20 bg-gradient-to-r from-gold/5 to-transparent">
            <CardContent className="py-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <h2 className="font-heading text-xl font-bold">{activePlan.title}</h2>
                    {activePlan.eventType && (
                      <span className="rounded-full border border-gold/30 bg-gold/10 px-2.5 py-0.5 text-[11px] font-medium text-gold">
                        {EVENT_TYPE_LABELS[activePlan.eventType] ?? activePlan.eventType}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                    {activePlan.eventDate && (
                      <span className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-gold" />
                        {new Date(activePlan.eventDate).toLocaleDateString("ro-MD", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                      </span>
                    )}
                    {activePlan.location && (
                      <span className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 text-gold" />
                        {activePlan.location}
                      </span>
                    )}
                    {activePlan.guestCountTarget && (
                      <span className="flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5 text-gold" />
                        {activePlan.guestCountTarget} invitați
                      </span>
                    )}
                    {activePlan.budgetTarget && (
                      <span className="flex items-center gap-1.5">
                        <Wallet className="h-3.5 w-3.5 text-gold" />
                        {activePlan.budgetTarget}€
                      </span>
                    )}
                  </div>
                </div>
                <Link href={`/cabinet/planifica/${activePlan.id}`}>
                  <Button variant="outline" size="sm" className="gap-1 text-xs">
                    Deschide <ArrowRight className="h-3 w-3" />
                  </Button>
                </Link>
              </div>

              {/* Countdown */}
              {activePlan.eventDate && (
                <div className="mt-4 pt-4 border-t border-border/20">
                  <CountdownDisplay targetDate={activePlan.eventDate} />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Planning Phases Timeline */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
              Pașii planificării
            </h3>
            {getPlanningPhases(
              activePlan,
              stats ?? { checklistTotal: 0, checklistDone: 0, guestCount: 0, tableCount: 0 },
            ).map((phase, idx, arr) => {
              const Icon = phase.icon;
              const isLast = idx === arr.length - 1;

              return (
                <div key={phase.id} className="relative">
                  {/* Connector line */}
                  {!isLast && (
                    <div className="absolute left-5 top-[56px] bottom-0 w-px bg-border/40" />
                  )}

                  <Link
                    href={phase.href}
                    className="group block"
                  >
                    <Card className={cn(
                      "transition-all hover:border-gold/40",
                      phase.status === "done" && "border-success/20 bg-success/5",
                      phase.status === "active" && "border-gold/20",
                    )}>
                      <CardContent className="py-4">
                        <div className="flex items-start gap-4">
                          {/* Step indicator */}
                          <div className={cn(
                            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                            phase.status === "done"
                              ? "bg-success/10 text-success"
                              : phase.status === "active"
                                ? "bg-gold/10 text-gold"
                                : "bg-muted/50 text-muted-foreground/50",
                          )}>
                            {phase.status === "done" ? (
                              <CheckCircle2 className="h-5 w-5" />
                            ) : (
                              <Icon className="h-5 w-5" />
                            )}
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <h4 className={cn(
                                "font-heading font-semibold",
                                phase.status === "upcoming" && "text-muted-foreground/70",
                              )}>
                                {phase.title}
                              </h4>
                              <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-gold transition-colors shrink-0" />
                            </div>
                            <p className="text-sm text-muted-foreground mt-0.5">
                              {phase.description}
                            </p>

                            {/* Progress bar */}
                            {phase.progress > 0 && (
                              <div className="mt-2.5 h-1.5 w-full rounded-full bg-border/30 overflow-hidden max-w-xs">
                                <div
                                  className={cn(
                                    "h-full rounded-full transition-all",
                                    phase.status === "done" ? "bg-success" : "bg-gold",
                                  )}
                                  style={{ width: `${Math.min(phase.progress, 100)}%` }}
                                />
                              </div>
                            )}

                            {/* Details chips for setup phase */}
                            {phase.details && (
                              <div className="flex flex-wrap gap-2 mt-2.5">
                                {phase.details.map((d) => (
                                  <span
                                    key={d.label}
                                    className={cn(
                                      "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px]",
                                      d.done
                                        ? "bg-success/10 text-success border border-success/20"
                                        : "bg-muted/50 text-muted-foreground border border-border/30",
                                    )}
                                  >
                                    {d.done ? (
                                      <CheckCircle2 className="h-3 w-3" />
                                    ) : (
                                      <Circle className="h-3 w-3" />
                                    )}
                                    {d.label}: {d.value}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                </div>
              );
            })}
          </div>

          {/* Other plans */}
          {plans.length > 1 && (
            <div className="mt-8">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Alte planuri
              </h3>
              <div className="grid gap-3 md:grid-cols-2">
                {plans.slice(1).map((p) => (
                  <Link
                    key={p.id}
                    href={`/cabinet/planifica/${p.id}`}
                    className="block rounded-xl border border-border/40 bg-card p-4 transition-all hover:border-gold/40"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <h4 className="font-heading font-semibold truncate">{p.title}</h4>
                      {p.eventType && (
                        <span className="rounded-full border border-border/40 px-2 py-0.5 text-[10px] uppercase text-muted-foreground shrink-0">
                          {EVENT_TYPE_LABELS[p.eventType] ?? p.eventType}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                      {p.eventDate && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(p.eventDate).toLocaleDateString("ro-MD")}
                        </span>
                      )}
                      {p.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {p.location}
                        </span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Create Plan Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Creează un plan nou</DialogTitle>
          </DialogHeader>

          <div className="grid gap-5 py-2">
            <div className="space-y-2">
              <Label htmlFor="title">Titlul planului *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Nunta Ana & Ion"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Tip eveniment</Label>
                <Select
                  value={eventType}
                  onValueChange={(v) => { if (v) setEventType(v); }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EVENT_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="date">Data</Label>
                <Input
                  id="date"
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="loc">Locație</Label>
              <Input
                id="loc"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Chișinău"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="guests">Invitați estimați</Label>
                <Input
                  id="guests"
                  type="number"
                  min="0"
                  value={guestCount}
                  onChange={(e) => setGuestCount(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="budget">Buget (EUR)</Label>
                <Input
                  id="budget"
                  type="number"
                  min="0"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Note</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Anulează
            </Button>
            <Button
              disabled={creating}
              onClick={handleCreate}
              className="bg-gold text-background hover:bg-gold-dark"
            >
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Creează"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Countdown to event date */
function CountdownDisplay({ targetDate }: { targetDate: string }) {
  const target = new Date(targetDate);
  const now = new Date();
  const diffMs = target.getTime() - now.getTime();

  if (diffMs <= 0) {
    return (
      <p className="text-sm font-medium text-gold flex items-center gap-2">
        <Sparkles className="h-4 w-4" />
        Evenimentul a avut loc!
      </p>
    );
  }

  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const months = Math.floor(days / 30);
  const weeks = Math.floor((days % 30) / 7);
  const remainingDays = days % 7;

  return (
    <div className="flex items-center gap-4">
      <p className="text-sm text-muted-foreground">Timp rămas:</p>
      <div className="flex gap-3">
        {months > 0 && (
          <div className="text-center">
            <p className="text-xl font-heading font-bold text-gold">{months}</p>
            <p className="text-[10px] text-muted-foreground">luni</p>
          </div>
        )}
        {(weeks > 0 || months > 0) && (
          <div className="text-center">
            <p className="text-xl font-heading font-bold text-gold">{weeks}</p>
            <p className="text-[10px] text-muted-foreground">săpt.</p>
          </div>
        )}
        <div className="text-center">
          <p className="text-xl font-heading font-bold text-gold">
            {months > 0 || weeks > 0 ? remainingDays : days}
          </p>
          <p className="text-[10px] text-muted-foreground">zile</p>
        </div>
      </div>
    </div>
  );
}
