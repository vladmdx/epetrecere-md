"use client";

// M4 — Client cabinet: Planner index (list of the user's event plans
// + "Create new plan" dialog). Each plan seeds its own checklist from a
// per-event-type template when first created.

import { useEffect, useState } from "react";
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
  Calendar,
  Users,
  Wallet,
  MapPin,
  ArrowLeft,
  Loader2,
  ClipboardList,
} from "lucide-react";

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

const EVENT_TYPES: { value: string; label: string }[] = [
  { value: "wedding", label: "Nuntă" },
  { value: "baptism", label: "Botez" },
  { value: "cumatrie", label: "Cumătrie" },
  { value: "birthday", label: "Zi de naștere" },
  { value: "corporate", label: "Corporate" },
  { value: "other", label: "Alt tip" },
];

export default function PlannerIndexPage() {
  const { isSignedIn, isLoaded } = useUser();
  const [plans, setPlans] = useState<EventPlan[]>([]);
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
      setPlans(data.plans ?? []);
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

  return (
    <div className="mx-auto max-w-5xl py-8 px-4">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link
            href="/cabinet"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-gold"
          >
            <ArrowLeft className="h-3 w-3" /> Înapoi la cabinet
          </Link>
          <h1 className="mt-1 font-heading text-2xl font-bold">Planificator evenimente</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Checklist, invitați, așezare mese — toate la un loc.
          </p>
        </div>

        <Button
          onClick={() => setOpen(true)}
          className="gap-1 bg-gold text-background hover:bg-gold-dark"
        >
          <Plus className="h-4 w-4" /> Plan nou
        </Button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Creează un plan nou</DialogTitle>
            </DialogHeader>

            <div className="grid gap-4 py-2">
              <div>
                <Label htmlFor="title">Titlul planului *</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Nunta Ana & Ion"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Tip eveniment</Label>
                  <Select value={eventType} onValueChange={(v) => setEventType(v ?? "")}>
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
                <div>
                  <Label htmlFor="date">Data</Label>
                  <Input
                    id="date"
                    type="date"
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="loc">Locație</Label>
                <Input
                  id="loc"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Chișinău"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="guests">Invitați estimați</Label>
                  <Input
                    id="guests"
                    type="number"
                    min="0"
                    value={guestCount}
                    onChange={(e) => setGuestCount(e.target.value)}
                  />
                </div>
                <div>
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

              <div>
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
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Creează"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Se încarcă…
        </div>
      ) : plans.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/40 bg-card py-16 text-center">
          <ClipboardList className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <p className="text-muted-foreground">Niciun plan încă.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Creează primul tău plan — vei primi automat un checklist potrivit pentru tipul evenimentului.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {plans.map((p) => (
            <Link
              key={p.id}
              href={`/cabinet/planifica/${p.id}`}
              className="block rounded-xl border border-border/40 bg-card p-5 transition-all hover:border-gold/40"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="font-heading text-lg font-semibold">{p.title}</h3>
                {p.eventType && (
                  <span className="rounded-full border border-border/40 px-2 py-0.5 text-[10px] uppercase text-muted-foreground">
                    {EVENT_TYPES.find((t) => t.value === p.eventType)?.label ?? p.eventType}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                {p.eventDate && (
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    {new Date(p.eventDate).toLocaleDateString("ro-MD")}
                  </div>
                )}
                {p.location && (
                  <div className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" />
                    {p.location}
                  </div>
                )}
                {p.guestCountTarget && (
                  <div className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" />
                    {p.guestCountTarget} invitați
                  </div>
                )}
                {p.budgetTarget && (
                  <div className="flex items-center gap-1.5">
                    <Wallet className="h-3.5 w-3.5" />
                    {p.budgetTarget}€
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
