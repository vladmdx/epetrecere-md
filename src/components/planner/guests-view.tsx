"use client";

// M4 — Guest list sub-view: add guests, track RSVP, count totals.

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, Users, UserCheck, UserX, UserMinus } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Guest {
  id: number;
  fullName: string;
  phone: string | null;
  email: string | null;
  group: string | null;
  plusOnes: number;
  dietary: string | null;
  rsvp: "pending" | "accepted" | "declined" | "maybe";
  notes: string | null;
}

interface Props {
  planId: number;
  guestCountTarget: number | null;
  guests: Guest[];
  onChange: (guests: Guest[]) => void;
}

const RSVP_CONFIG: Record<
  Guest["rsvp"],
  { label: string; color: string; icon: React.ComponentType<{ className?: string }> }
> = {
  pending: { label: "În așteptare", color: "text-muted-foreground", icon: UserMinus },
  accepted: { label: "Confirmat", color: "text-emerald-500", icon: UserCheck },
  declined: { label: "Refuzat", color: "text-red-500", icon: UserX },
  maybe: { label: "Posibil", color: "text-amber-500", icon: UserMinus },
};

export function GuestsView({ planId, guestCountTarget, guests, onChange }: Props) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [group, setGroup] = useState("friends");
  const [plusOnes, setPlusOnes] = useState("0");
  const [adding, setAdding] = useState(false);

  const stats = useMemo(() => {
    let total = 0;
    const byRsvp = { pending: 0, accepted: 0, declined: 0, maybe: 0 };
    for (const g of guests) {
      total += 1 + (g.plusOnes || 0);
      byRsvp[g.rsvp] += 1 + (g.plusOnes || 0);
    }
    return { total, ...byRsvp };
  }, [guests]);

  async function addGuest() {
    if (name.trim().length < 1) {
      toast.error("Numele este obligatoriu.");
      return;
    }
    setAdding(true);
    try {
      const res = await fetch(`/api/event-plans/${planId}/guests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: name.trim(),
          phone: phone || undefined,
          email: email || undefined,
          group,
          plusOnes: Number(plusOnes) || 0,
        }),
      });
      if (!res.ok) {
        toast.error("Eroare la adăugare.");
        return;
      }
      const data = await res.json();
      onChange([...guests, data.guest]);
      setName("");
      setPhone("");
      setEmail("");
      setPlusOnes("0");
    } finally {
      setAdding(false);
    }
  }

  async function updateRsvp(guest: Guest, rsvp: Guest["rsvp"]) {
    const prev = guests;
    onChange(guests.map((g) => (g.id === guest.id ? { ...g, rsvp } : g)));
    const res = await fetch(`/api/event-plans/${planId}/guests/${guest.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rsvp }),
    });
    if (!res.ok) {
      toast.error("Nu am putut actualiza.");
      onChange(prev);
    }
  }

  async function deleteGuest(guest: Guest) {
    const prev = guests;
    onChange(guests.filter((g) => g.id !== guest.id));
    const res = await fetch(`/api/event-plans/${planId}/guests/${guest.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast.error("Nu am putut șterge.");
      onChange(prev);
    }
  }

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard icon={Users} label="Total" value={stats.total} target={guestCountTarget} />
        <StatCard icon={UserCheck} label="Confirmați" value={stats.accepted} color="text-emerald-500" />
        <StatCard icon={UserMinus} label="În așteptare" value={stats.pending} />
        <StatCard icon={UserMinus} label="Posibil" value={stats.maybe} color="text-amber-500" />
        <StatCard icon={UserX} label="Refuzați" value={stats.declined} color="text-red-500" />
      </div>

      {/* Add guest */}
      <div className="rounded-xl border border-border/40 bg-card p-4">
        <p className="mb-3 text-xs font-medium uppercase text-muted-foreground">Adaugă invitat</p>
        <div className="grid gap-3 md:grid-cols-5">
          <div className="md:col-span-2">
            <Label htmlFor="gname" className="sr-only">
              Nume
            </Label>
            <Input
              id="gname"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nume și prenume"
            />
          </div>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Telefon" />
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            type="email"
          />
          <div className="flex gap-2">
            <Select value={group} onValueChange={(v) => setGroup(v ?? "friends")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bride">Partea miresei</SelectItem>
                <SelectItem value="groom">Partea mirelui</SelectItem>
                <SelectItem value="family">Familie</SelectItem>
                <SelectItem value="friends">Prieteni</SelectItem>
                <SelectItem value="work">Colegi</SelectItem>
                <SelectItem value="other">Altele</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <Label className="text-xs" htmlFor="plusones">
            +1 / copii:
          </Label>
          <Input
            id="plusones"
            type="number"
            min="0"
            max="20"
            value={plusOnes}
            onChange={(e) => setPlusOnes(e.target.value)}
            className="w-24"
          />
          <Button
            onClick={addGuest}
            disabled={adding}
            className="ml-auto gap-1 bg-gold text-background hover:bg-gold-dark"
          >
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Adaugă
          </Button>
        </div>
      </div>

      {/* Table */}
      {guests.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">Niciun invitat încă.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border/40 bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3 text-left">Nume</th>
                <th className="p-3 text-left">Grup</th>
                <th className="p-3 text-left">Contact</th>
                <th className="p-3 text-left">+1</th>
                <th className="p-3 text-left">RSVP</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {guests.map((g) => {
                const cfg = RSVP_CONFIG[g.rsvp];
                const Icon = cfg.icon;
                return (
                  <tr
                    key={g.id}
                    className="border-b border-border/20 last:border-0 hover:bg-muted/30"
                  >
                    <td className="p-3 font-medium">{g.fullName}</td>
                    <td className="p-3 text-muted-foreground">{g.group || "—"}</td>
                    <td className="p-3 text-muted-foreground">
                      {g.phone || g.email || "—"}
                    </td>
                    <td className="p-3">{g.plusOnes > 0 ? `+${g.plusOnes}` : "—"}</td>
                    <td className="p-3">
                      <Select
                        value={g.rsvp}
                        onValueChange={(v) => updateRsvp(g, v as Guest["rsvp"])}
                      >
                        <SelectTrigger
                          className={cn("h-8 w-[140px] gap-1", cfg.color)}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">În așteptare</SelectItem>
                          <SelectItem value="accepted">Confirmat</SelectItem>
                          <SelectItem value="maybe">Posibil</SelectItem>
                          <SelectItem value="declined">Refuzat</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-3">
                      <button
                        onClick={() => deleteGuest(g)}
                        className="text-muted-foreground transition-colors hover:text-red-500"
                        aria-label="Șterge"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  target,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  target?: number | null;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-border/40 bg-card p-3">
      <div className={cn("flex items-center gap-1.5 text-xs text-muted-foreground", color)}>
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className="mt-1 font-heading text-xl font-bold">
        {value}
        {target ? <span className="text-xs font-normal text-muted-foreground"> / {target}</span> : null}
      </p>
    </div>
  );
}
