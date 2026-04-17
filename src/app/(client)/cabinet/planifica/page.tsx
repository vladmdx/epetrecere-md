"use client";

// M4 — Planner index: redirects to first plan or shows create dialog.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
import { Plus, Loader2, Sparkles, Heart } from "lucide-react";
import Link from "next/link";

const EVENT_TYPES = [
  { value: "wedding", label: "Nuntă" },
  { value: "baptism", label: "Botez" },
  { value: "cumatrie", label: "Cumătrie" },
  { value: "birthday", label: "Zi de naștere" },
  { value: "corporate", label: "Corporate" },
  { value: "other", label: "Alt tip" },
];

export default function PlannerIndexPage() {
  const { isSignedIn, isLoaded } = useUser();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [noPlan, setNoPlan] = useState(false);
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
      setNoPlan(true);
      return;
    }

    fetch("/api/event-plans", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { plans: [] }))
      .then((data) => {
        const plans = data.plans ?? [];
        if (plans.length > 0) {
          router.replace(`/cabinet/planifica/${plans[0].id}`);
        } else {
          setNoPlan(true);
          setLoading(false);
        }
      })
      .catch(() => {
        setNoPlan(true);
        setLoading(false);
      });
  }, [isLoaded, isSignedIn, router]);

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
      router.replace(`/cabinet/planifica/${data.plan.id}`);
    } catch {
      toast.error("Eroare la creare.");
    } finally {
      setCreating(false);
    }
  }

  if (loading && !noPlan) {
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

  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <Sparkles className="mx-auto mb-4 h-12 w-12 text-gold/60" />
      <h1 className="font-heading text-xl font-bold">
        Începe planificarea evenimentului
      </h1>
      <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
        Creează planul tău — vei primi automat un checklist potrivit pentru tipul
        evenimentului, cu sarcini, termene și notificări.
      </p>
      <Button
        onClick={() => setOpen(true)}
        className="mt-6 gap-2 bg-gold text-background hover:bg-gold-dark"
      >
        <Plus className="h-4 w-4" /> Creează plan
      </Button>

      {/* Create Plan Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg text-left">
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
                <Select value={eventType} onValueChange={(v) => { if (v) setEventType(v); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EVENT_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
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
            <Button variant="outline" onClick={() => setOpen(false)}>Anulează</Button>
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
  );
}
