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
  Loader2,
  TrendingUp,
  CheckCircle2,
  XCircle,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocale } from "@/hooks/use-locale";

// Matched leads stay anonymous; confirmed booking contacts live in Reservations.

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

export default function LeadMatchesPage() {
  const { t } = useLocale();
  const [matches, setMatches] = useState<LeadMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "new" | "unlocked" | "won">("all");

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/lead-matches", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setMatches(data.matches ?? []);
    } catch {
      toast.error(t("vendor.leadsPage.loadError"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleStatus(id: number, status: "contacted" | "won" | "lost") {
    try {
      const res = await fetch(`/api/lead-matches/${id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
      toast.success(t("vendor.leadsPage.statusUpdated"));
      await load();
    } catch {
      toast.error(t("vendor.leadsPage.statusError"));
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
          <h1 className="font-heading text-2xl font-bold">{t("vendor.leadsPage.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("vendor.leadsPage.subtitle")}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-2">
        {([
          ["all", "common.all", matches.length],
          ["new", "vendor.leadsPage.filterNew", matches.filter((m) => m.status === "matched" || m.status === "seen").length],
          ["unlocked", "vendor.leadsPage.filterUnlocked", matches.filter((m) => m.status === "unlocked" || m.status === "contacted").length],
          ["won", "vendor.leadsPage.filterWon", matches.filter((m) => m.status === "won").length],
        ] as const).map(([key, labelKey, count]) => (
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
            {t(labelKey)} <span className="ml-1 text-muted-foreground">({count})</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> {t("vendor.leadsPage.loading")}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/40 bg-card py-16 text-center">
          <Flame className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <p className="text-muted-foreground">
            {t("vendor.leadsPage.empty")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("vendor.leadsPage.emptyHint")}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((m) => (
            <LeadMatchCard
              key={m.id}
              match={m}
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
  onStatus: (status: "contacted" | "won" | "lost") => void;
}) {
  const { t } = useLocale();
  const statusConfig: Record<LeadMatch["status"], { labelKey: string; variant: string }> = {
    matched: { labelKey: "vendor.leadsPage.statusNew", variant: "bg-blue-500/10 text-blue-500 border-blue-500/30" },
    seen: { labelKey: "vendor.leadsPage.statusSeen", variant: "bg-muted text-muted-foreground border-border/40" },
    unlocked: { labelKey: "vendor.leadsPage.statusUnlocked", variant: "bg-gold/10 text-gold border-gold/30" },
    contacted: { labelKey: "vendor.leadsPage.statusContacted", variant: "bg-purple-500/10 text-purple-500 border-purple-500/30" },
    won: { labelKey: "vendor.leadsPage.statusWon", variant: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30" },
    lost: { labelKey: "vendor.leadsPage.statusLost", variant: "bg-red-500/10 text-red-500 border-red-500/30" },
  };
  const cfg = statusConfig[match.status];

  return (
    <div className="rounded-xl border border-border/40 bg-card p-5">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge className={cn("border", cfg.variant)}>{t(cfg.labelKey)}</Badge>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5" />
            {t("vendor.leadsPage.score")}{" "}
            <span className="font-semibold text-foreground">{match.score}</span>
          </div>
        </div>
        <span className="text-xs text-muted-foreground">
          {new Date(match.createdAt).toLocaleDateString("ro-MD")}
        </span>
      </div>

      {/* Anonymous reference, not personal identity */}
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
            {match.lead.guestCount} {t("common.guests")}
          </div>
        )}
      </div>

      {match.lead.budget && (
        <div className="mb-3 inline-flex items-center gap-1 rounded-lg bg-muted px-2 py-1 text-xs">
          <Wallet className="h-3 w-3 text-gold" />
          {t("vendor.leadsPage.budget")}{" "}
          <span className="font-semibold">{match.lead.budget}€</span>
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

      <p className="mb-4 text-xs text-muted-foreground">
        {t("vendor.leadsPage.contactsPrivate")}
      </p>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        {(match.status === "matched" || match.status === "seen" || match.status === "unlocked") ? (
          <Button size="sm" variant="outline" onClick={() => onStatus("contacted")} className="gap-1">
            <Eye className="h-3.5 w-3.5" /> {t("vendor.leadsPage.markContacted")}
          </Button>
        ) : match.status === "contacted" ? (
          <>
            <Button size="sm" onClick={() => onStatus("won")} className="gap-1 bg-emerald-500 text-white hover:bg-emerald-600">
              <CheckCircle2 className="h-3.5 w-3.5" /> {t("vendor.leadsPage.statusWon")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => onStatus("lost")} className="gap-1">
              <XCircle className="h-3.5 w-3.5" /> {t("vendor.leadsPage.statusLost")}
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}
