"use client";

// Multi-event planner index — lists the user's active plans and offers a
// "Plan nou" dialog. No longer auto-redirects; the user explicitly picks
// which event they want to work on.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Loader2,
  Sparkles,
  Heart,
  Calendar as CalendarIcon,
  MapPin,
  Users,
  ArrowRight,
} from "lucide-react";
import { CustomCalendar } from "@/components/public/custom-calendar";

const EVENT_TYPES = [
  { value: "wedding", label: "Nuntă" },
  { value: "baptism", label: "Botez" },
  { value: "cumatrie", label: "Cumătrie" },
  { value: "birthday", label: "Zi de naștere" },
  { value: "corporate", label: "Corporate" },
  { value: "other", label: "Alt tip" },
];

const EVENT_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  EVENT_TYPES.map((t) => [t.value, t.label]),
);

interface PlanListItem {
  id: number;
  title: string;
  eventType: string | null;
  eventDate: string | null;
  location: string | null;
  guestCountTarget: number | null;
  budgetTarget: number | null;
}

export default function PlannerIndexPage() {
  const { isSignedIn, isLoaded } = useUser();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<PlanListItem[]>([]);
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
      const data = await res.json();
      toast.success("Plan creat — checklist-ul a fost pregătit automat!");
      router.push(`/cabinet/planifica/${data.plan.id}`);
    } catch {
      toast.error("Eroare la creare.");
    } finally {
      setCreating(false);
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
          className="mt-4 inline-block rounded-xl bg-gold px-4 py-2 text-sm font-medium text-background hover:bg-gold-dark"
        >
          Autentificare
        </Link>
      </div>
    );
  }

  // Empty state — no plans yet.
  if (plans.length === 0) {
    return (
      <>
        <div className="mx-auto max-w-md py-20 text-center">
          <Sparkles className="mx-auto mb-4 h-12 w-12 text-gold/60" />
          <h1 className="font-heading text-xl font-bold">
            Începe planificarea evenimentului
          </h1>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            Creează primul tău plan — vei primi automat un checklist adaptat
            tipului de eveniment, cu sarcini, termene și notificări.
          </p>
          <Button
            onClick={() => setOpen(true)}
            className="mt-6 gap-2 bg-gold text-background hover:bg-gold-dark"
          >
            <Plus className="h-4 w-4" /> Creează plan
          </Button>
        </div>
        <CreatePlanDialog
          open={open}
          onOpenChange={setOpen}
          creating={creating}
          onSubmit={handleCreate}
          state={{
            title,
            setTitle,
            eventType,
            setEventType,
            eventDate,
            setEventDate,
            location,
            setLocation,
            guestCount,
            setGuestCount,
            budget,
            setBudget,
            notes,
            setNotes,
          }}
        />
      </>
    );
  }

  // Plan list.
  return (
    <>
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="font-heading text-2xl font-bold">Evenimentele mele</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {plans.length} plan{plans.length === 1 ? "" : "uri"} active
            </p>
          </div>
          <Button
            onClick={() => setOpen(true)}
            className="gap-2 bg-gold text-background hover:bg-gold-dark"
          >
            <Plus className="h-4 w-4" /> Plan nou
          </Button>
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
                className="group rounded-xl border border-border/40 bg-card p-5 transition-all hover:border-gold/40 hover:shadow-lg"
              >
                <div className="flex items-start justify-between gap-3">
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
            );
          })}
        </div>
      </div>
      <CreatePlanDialog
        open={open}
        onOpenChange={setOpen}
        creating={creating}
        onSubmit={handleCreate}
        state={{
          title,
          setTitle,
          eventType,
          setEventType,
          eventDate,
          setEventDate,
          location,
          setLocation,
          guestCount,
          setGuestCount,
          budget,
          setBudget,
          notes,
          setNotes,
        }}
      />
    </>
  );
}

// ─── Create Plan Dialog ───────────────────────────────────────────────
// Extracted so both the empty state and the populated list share the
// same form without duplicating markup.

interface DialogState {
  title: string;
  setTitle: (v: string) => void;
  eventType: string;
  setEventType: (v: string) => void;
  eventDate: string;
  setEventDate: (v: string) => void;
  location: string;
  setLocation: (v: string) => void;
  guestCount: string;
  setGuestCount: (v: string) => void;
  budget: string;
  setBudget: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;
}

function CreatePlanDialog({
  open,
  onOpenChange,
  creating,
  onSubmit,
  state,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  creating: boolean;
  onSubmit: () => void;
  state: DialogState;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg text-left">
        <DialogHeader>
          <DialogTitle>Creează un plan nou</DialogTitle>
        </DialogHeader>

        <div className="grid gap-5 py-2">
          <div className="space-y-2">
            <Label htmlFor="title">Titlul planului *</Label>
            <Input
              id="title"
              value={state.title}
              onChange={(e) => state.setTitle(e.target.value)}
              placeholder="Ex: Nunta Ana & Ion"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Tip eveniment</Label>
              <Select value={state.eventType} onValueChange={(v) => { if (v) state.setEventType(v); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EVENT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Data</Label>
              <CustomCalendar
                value={state.eventDate ? new Date(state.eventDate + "T00:00:00") : null}
                onChange={(d) => {
                  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                  state.setEventDate(iso);
                }}
                placeholder="Alege data"
                className="flex-none"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="loc">Locație</Label>
            <Input
              id="loc"
              value={state.location}
              onChange={(e) => state.setLocation(e.target.value)}
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
                value={state.guestCount}
                onChange={(e) => state.setGuestCount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="budget">Buget (EUR)</Label>
              <Input
                id="budget"
                type="number"
                min="0"
                value={state.budget}
                onChange={(e) => state.setBudget(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Note</Label>
            <Textarea
              id="notes"
              value={state.notes}
              onChange={(e) => state.setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Anulează</Button>
          <Button
            disabled={creating}
            onClick={onSubmit}
            className="bg-gold text-background hover:bg-gold-dark"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Creează"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
