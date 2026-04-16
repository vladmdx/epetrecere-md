"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Flame,
  Calendar,
  MapPin,
  Users,
  Wallet,
  Phone,
  Mail,
  Loader2,
  TrendingUp,
  CheckCircle2,
  XCircle,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";

// M3 #8 — Vendor "Lead-uri noi" dashboard.
// Lists matches produced by the lead engine, with credit balance + unlock /
// status-change actions.

interface LeadMatch {
  id: number;
  score: number;
  reasons: string[];
  status: "matched" | "seen" | "unlocked" | "contacted" | "won" | "lost";
  seenAt: string | null;
  unlockedAt: string | null;
  createdAt: string;
  lead: {
    id: number;
    name: string;
    phone: string | null;
    email: string | null;
    eventType: string | null;
    eventDate: string | null;
    location: string | null;
    guestCount: number | null;
    budget: number | null;
    source: string | null;
    message: string | null;
  };
}

interface Credits {
  balance: number;
  totalPurchased: number;
  totalSpent: number;
}

export default function LeadMatchesPage() {
  const [matches, setMatches] = useState<LeadMatch[]>([]);
  const [credits, setCredits] = useState<Credits | null>(null);
  const [loading, setLoading] = useState(true);
  const [unlocking, setUnlocking] = useState<number | null>(null);
  const [filter, setFilter] = useState<"all" | "new" | "unlocked" | "won">("all");

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/lead-matches", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setMatches(data.matches ?? []);
      setCredits(data.credits ?? null);
    } catch {
      toast.error("Nu s-au putut încărca lead-urile.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleUnlock(id: number) {
    setUnlocking(id);
    try {
      const res = await fetch(`/api/lead-matches/${id}/unlock`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 402) {
          toast.error("Credite insuficiente. Contactează administratorul pentru top-up.");
        } else {
          toast.error(data.error || "Unlock eșuat.");
        }
        return;
      }
      toast.success(data.alreadyUnlocked ? "Deja deblocat" : "Lead deblocat!");
      await load();
    } catch {
      toast.error("Eroare la deblocare.");
    } finally {
      setUnlocking(null);
    }
  }

  async function handleStatus(id: number, status: "contacted" | "won" | "lost") {
    try {
      const res = await fetch(`/api/lead-matches/${id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
      toast.success("Status actualizat.");
      await load();
    } catch {
      toast.error("Nu s-a putut schimba statusul.");
    }
  }

  const filtered = matches.filter((m) => {
    if (filter === "all") return true;
    if (filter === "new") return m.status === "matched" || m.status === "seen";
    if (filter === "unlocked") return m.status === "unlocked" || m.status === "contacted";
    if (filter === "won") return m.status === "won";
    return true;
  });

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold">Lead-uri noi</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Clienți care caută vendori potriviți — contactele sunt disponibile gratuit.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-2">
        {([
          ["all", "Toate", matches.length],
          ["new", "Noi", matches.filter((m) => m.status === "matched" || m.status === "seen").length],
          ["unlocked", "Deblocate", matches.filter((m) => m.status === "unlocked" || m.status === "contacted").length],
          ["won", "Câștigate", matches.filter((m) => m.status === "won").length],
        ] as const).map(([key, label, count]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-sm transition-colors",
              filter === key
                ? "border-gold bg-gold/10 text-gold"
                : "border-border/40 hover:border-gold/30",
            )}
          >
            {label} <span className="ml-1 text-muted-foreground">({count})</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Se încarcă…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/40 bg-card py-16 text-center">
          <Flame className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <p className="text-muted-foreground">
            Niciun lead în această categorie încă.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Lead-uri noi vor apărea automat când clienți care potrivesc profilul tău completează
            planificatorul sau formularul de solicitare.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((m) => (
            <LeadMatchCard
              key={m.id}
              match={m}
              unlocking={unlocking === m.id}
              onUnlock={() => handleUnlock(m.id)}
              onStatus={(status) => handleStatus(m.id, status)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LeadMatchCard({
  match,
  onStatus,
}: {
  match: LeadMatch;
  unlocking?: boolean;
  onUnlock?: () => void;
  onStatus: (status: "contacted" | "won" | "lost") => void;
}) {
  const statusConfig: Record<LeadMatch["status"], { label: string; variant: string }> = {
    matched: { label: "Nou", variant: "bg-blue-500/10 text-blue-500 border-blue-500/30" },
    seen: { label: "Văzut", variant: "bg-muted text-muted-foreground border-border/40" },
    unlocked: { label: "Deblocat", variant: "bg-gold/10 text-gold border-gold/30" },
    contacted: { label: "Contactat", variant: "bg-purple-500/10 text-purple-500 border-purple-500/30" },
    won: { label: "Câștigat", variant: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30" },
    lost: { label: "Pierdut", variant: "bg-red-500/10 text-red-500 border-red-500/30" },
  };
  const cfg = statusConfig[match.status];

  return (
    <div className="rounded-xl border border-border/40 bg-card p-5">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge className={cn("border", cfg.variant)}>{cfg.label}</Badge>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5" />
            Scor: <span className="font-semibold text-foreground">{match.score}</span>
          </div>
        </div>
        <span className="text-xs text-muted-foreground">
          {new Date(match.createdAt).toLocaleDateString("ro-MD")}
        </span>
      </div>

      {/* Client name (masked or full) */}
      <h3 className="mb-2 font-heading text-lg font-semibold">
        {match.lead.name}
      </h3>

      {/* Event meta */}
      <div className="mb-3 grid grid-cols-2 gap-2 text-sm">
        {match.lead.eventType && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Flame className="h-3.5 w-3.5" />
            {match.lead.eventType}
          </div>
        )}
        {match.lead.eventDate && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" />
            {match.lead.eventDate}
          </div>
        )}
        {match.lead.location && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            {match.lead.location}
          </div>
        )}
        {match.lead.guestCount && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            {match.lead.guestCount} invitați
          </div>
        )}
      </div>

      {match.lead.budget && (
        <div className="mb-3 inline-flex items-center gap-1 rounded-lg bg-muted px-2 py-1 text-xs">
          <Wallet className="h-3 w-3 text-gold" />
          Buget: <span className="font-semibold">{match.lead.budget}€</span>
        </div>
      )}

      {/* Reasons */}
      {match.reasons.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1">
          {match.reasons.map((r, i) => (
            <span
              key={i}
              className="rounded-full border border-border/40 px-2 py-0.5 text-xs text-muted-foreground"
            >
              ✓ {r}
            </span>
          ))}
        </div>
      )}

      {/* Message */}
      {match.lead.message && (
        <div className="mb-3 rounded-lg border-l-2 border-gold/40 bg-muted/40 p-2 text-xs text-muted-foreground">
          {match.lead.message}
        </div>
      )}

      {/* Contact — always visible (free platform) */}
      <div className="mb-4 space-y-1.5">
        {match.lead.phone && (
          <div className="flex items-center gap-2 text-sm">
            <Phone className="h-3.5 w-3.5 text-gold" />
            <a href={`tel:${match.lead.phone}`} className="font-medium hover:text-gold">
              {match.lead.phone}
            </a>
          </div>
        )}
        {match.lead.email && (
          <div className="flex items-center gap-2 text-sm">
            <Mail className="h-3.5 w-3.5 text-gold" />
            <a href={`mailto:${match.lead.email}`} className="hover:text-gold">
              {match.lead.email}
            </a>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        {(match.status === "matched" || match.status === "seen" || match.status === "unlocked") ? (
          <Button size="sm" variant="outline" onClick={() => onStatus("contacted")} className="gap-1">
            <Eye className="h-3.5 w-3.5" /> Marchează contactat
          </Button>
        ) : match.status === "contacted" ? (
          <>
            <Button size="sm" onClick={() => onStatus("won")} className="gap-1 bg-emerald-500 text-white hover:bg-emerald-600">
              <CheckCircle2 className="h-3.5 w-3.5" /> Câștigat
            </Button>
            <Button size="sm" variant="outline" onClick={() => onStatus("lost")} className="gap-1">
              <XCircle className="h-3.5 w-3.5" /> Pierdut
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}
