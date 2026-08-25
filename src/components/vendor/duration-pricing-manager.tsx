"use client";

// Duration-based pricing with optional scope overrides.
//
// Artists declare base tiers — "1h = 100€", "45 min = 80€", "2h = 150€" —
// and can add override tiers that kick in for weekends, evenings, or specific
// days ("Friday → 150€ / h"). Clients see the correct price for their event
// date and chosen duration.

import { useEffect, useMemo, useState } from "react";
import {
  Loader2,
  Plus,
  Trash2,
  Clock,
  Pencil,
  Check,
  X,
  Calendar,
  Moon,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/pricing/resolve";
import { EventPricingManager } from "@/components/vendor/event-pricing-manager";
import { useLocale } from "@/hooks/use-locale";

type Scope = "base" | "weekend" | "weekday" | "evening" | "specific_day";

interface Package {
  id: number;
  artistId: number;
  pricingMode?: string | null;
  nameRo: string | null;
  price: number | null;
  durationHours: number | null;
  durationMinutes: number | null;
  scope: Scope;
  scopeDayOfWeek: number | null;
  scopeFromTime: string | null;
  isVisible: boolean;
}

interface Draft {
  id?: number;
  hours: string;
  minutes: string;
  price: string;
  nameRo: string;
  scope: Scope;
  scopeDayOfWeek: string;
  scopeFromTime: string;
}

function emptyDraft(scope: Scope = "base"): Draft {
  return {
    hours: "",
    minutes: "",
    price: "",
    nameRo: "",
    scope,
    scopeDayOfWeek: "5", // Friday default
    scopeFromTime: "18:00",
  };
}

const DAY_NAME_KEYS = [
  "vendor.durationPricing.daySunday",
  "vendor.durationPricing.dayMonday",
  "vendor.durationPricing.dayTuesday",
  "vendor.durationPricing.dayWednesday",
  "vendor.durationPricing.dayThursday",
  "vendor.durationPricing.dayFriday",
  "vendor.durationPricing.daySaturday",
];

const SCOPE_META: Record<
  Scope,
  { labelKey: string; icon: React.ComponentType<{ className?: string }>; color: string }
> = {
  base: {
    labelKey: "vendor.durationPricing.scopeBase",
    icon: Clock,
    color: "text-foreground",
  },
  weekend: {
    labelKey: "vendor.durationPricing.scopeWeekend",
    icon: Calendar,
    color: "text-purple-400",
  },
  weekday: {
    labelKey: "vendor.durationPricing.scopeWeekday",
    icon: Calendar,
    color: "text-blue-400",
  },
  evening: {
    labelKey: "vendor.durationPricing.scopeEvening",
    icon: Moon,
    color: "text-indigo-400",
  },
  specific_day: {
    labelKey: "vendor.durationPricing.scopeSpecificDay",
    icon: Sparkles,
    color: "text-amber-400",
  },
};

function scopeDescription(
  pkg: Package,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  switch (pkg.scope) {
    case "weekend":
      return t("vendor.durationPricing.weekendDays");
    case "weekday":
      return t("vendor.durationPricing.weekdayDays");
    case "evening":
      return t("vendor.durationPricing.fromTime", {
        time: pkg.scopeFromTime ?? "18:00",
      });
    case "specific_day":
      return pkg.scopeDayOfWeek != null
        ? t(DAY_NAME_KEYS[pkg.scopeDayOfWeek])
        : "";
    default:
      return "";
  }
}

export function DurationPricingManager({ artistId }: { artistId: number }) {
  const { t } = useLocale();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [packages, setPackages] = useState<Package[]>([]);
  const [addingScope, setAddingScope] = useState<Scope | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(emptyDraft());

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/artist-packages?artist_id=${artistId}`);
      if (!res.ok) throw new Error();
      // Per-event rows live in the same table but are edited by
      // EventPricingManager; showing them here as another duration tier is
      // exactly the confusion this split exists to avoid.
      const data = ((await res.json()) as Package[]).filter(
        (p) => p.pricingMode !== "per_event",
      );
      data.sort((a, b) => {
        const aMin = (a.durationHours ?? 0) * 60 + (a.durationMinutes ?? 0);
        const bMin = (b.durationHours ?? 0) * 60 + (b.durationMinutes ?? 0);
        return aMin - bMin;
      });
      setPackages(data);
    } catch {
      toast.error(t("vendor.durationPricing.loadError"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artistId]);

  function parseDraft(d: Draft): {
    price: number;
    durationHours: number;
    durationMinutes: number;
    scope: Scope;
    scopeDayOfWeek: number | null;
    scopeFromTime: string | null;
  } | null {
    const hours = d.hours === "" ? 0 : Number(d.hours.replace(",", "."));
    const minutes = d.minutes === "" ? 0 : Number(d.minutes);
    if (
      !Number.isFinite(hours) ||
      hours < 0 ||
      hours > 24 ||
      !Number.isFinite(minutes) ||
      minutes < 0 ||
      minutes > 59
    ) {
      toast.error(t("vendor.durationPricing.badDuration"));
      return null;
    }
    if (hours === 0 && minutes === 0) {
      toast.error(t("vendor.durationPricing.zeroDuration"));
      return null;
    }
    const price = Number(d.price);
    if (!Number.isFinite(price) || price < 0) {
      toast.error(t("vendor.durationPricing.badPrice"));
      return null;
    }
    let scopeDayOfWeek: number | null = null;
    let scopeFromTime: string | null = null;
    if (d.scope === "specific_day") {
      scopeDayOfWeek = Number(d.scopeDayOfWeek);
      if (!Number.isFinite(scopeDayOfWeek) || scopeDayOfWeek < 0 || scopeDayOfWeek > 6) {
        toast.error(t("vendor.durationPricing.pickValidDay"));
        return null;
      }
    }
    if (d.scope === "evening") {
      if (!/^\d{2}:\d{2}$/.test(d.scopeFromTime)) {
        toast.error(t("vendor.durationPricing.pickStartTime"));
        return null;
      }
      scopeFromTime = d.scopeFromTime;
    }
    // "1,5" hours plus 45 minutes is 2h15, not 1h75 — the API caps minutes at
    // 59 and used to reject the whole save with a bare 400.
    const totalMinutes =
      Math.round(hours * 60) + minutes;
    return {
      price: Math.round(price),
      durationHours: Math.floor(totalMinutes / 60),
      durationMinutes: totalMinutes % 60,
      scope: d.scope,
      scopeDayOfWeek,
      scopeFromTime,
    };
  }

  async function createPackage() {
    const parsed = parseDraft(draft);
    if (!parsed) return;
    setSaving(true);
    try {
      const totalMin =
        parsed.durationHours * 60 + parsed.durationMinutes;
      const name = draft.nameRo.trim() || formatDuration(totalMin);
      const res = await fetch(`/api/artist-packages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          artistId,
          nameRo: name,
          price: parsed.price,
          durationHours: parsed.durationHours,
          durationMinutes: parsed.durationMinutes,
          scope: parsed.scope,
          scopeDayOfWeek: parsed.scopeDayOfWeek,
          scopeFromTime: parsed.scopeFromTime,
          isVisible: true,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success(t("vendor.durationPricing.added"));
      setDraft(emptyDraft());
      setAddingScope(null);
      await load();
    } catch {
      toast.error(t("vendor.durationPricing.saveError"));
    } finally {
      setSaving(false);
    }
  }

  async function updatePackage(id: number) {
    const parsed = parseDraft(editDraft);
    if (!parsed) return;
    setSaving(true);
    try {
      const totalMin =
        parsed.durationHours * 60 + parsed.durationMinutes;
      const name =
        editDraft.nameRo.trim() || formatDuration(totalMin);
      const res = await fetch(`/api/artist-packages/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nameRo: name,
          price: parsed.price,
          durationHours: parsed.durationHours,
          durationMinutes: parsed.durationMinutes,
          scope: parsed.scope,
          scopeDayOfWeek: parsed.scopeDayOfWeek,
          scopeFromTime: parsed.scopeFromTime,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success(t("vendor.durationPricing.updated"));
      setEditingId(null);
      await load();
    } catch {
      toast.error(t("vendor.durationPricing.updateError"));
    } finally {
      setSaving(false);
    }
  }

  async function deletePackage(id: number) {
    if (!confirm(t("vendor.durationPricing.deleteConfirm"))) return;
    try {
      const res = await fetch(`/api/artist-packages/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      toast.success(t("vendor.durationPricing.deleted"));
      await load();
    } catch {
      toast.error(t("vendor.durationPricing.deleteError"));
    }
  }

  function startEdit(pkg: Package) {
    setEditingId(pkg.id);
    setEditDraft({
      hours: String(pkg.durationHours ?? 0),
      minutes: String(pkg.durationMinutes ?? 0),
      price: String(pkg.price ?? ""),
      nameRo: pkg.nameRo ?? "",
      scope: pkg.scope,
      scopeDayOfWeek:
        pkg.scopeDayOfWeek != null ? String(pkg.scopeDayOfWeek) : "5",
      scopeFromTime: pkg.scopeFromTime ?? "18:00",
    });
  }

  // Group packages by scope for rendering.
  const grouped = useMemo(() => {
    const g: Record<Scope, Package[]> = {
      base: [],
      weekend: [],
      weekday: [],
      evening: [],
      specific_day: [],
    };
    for (const p of packages) {
      const s = (p.scope || "base") as Scope;
      (g[s] || g.base).push(p);
    }
    return g;
  }, [packages]);

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-border/40 bg-card py-16">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  const renderDraftForm = (
    d: Draft,
    setD: (x: Draft) => void,
    onSave: () => void,
    onCancel: () => void,
  ) => (
    <div className="space-y-3 rounded-lg border border-gold/30 bg-gold/5 p-4">
      {/* Duration (hours + minutes) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <Label className="text-xs">{t("calendar.field.hours")}</Label>
          <Input
            type="number"
            min="0"
            max="24"
            value={d.hours}
            onChange={(e) => setD({ ...d, hours: e.target.value })}
            placeholder="0"
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs">{t("vendor.durationPricing.minutes")}</Label>
          <Input
            type="number"
            min="0"
            max="59"
            step="5"
            value={d.minutes}
            onChange={(e) => setD({ ...d, minutes: e.target.value })}
            placeholder="0"
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs">{t("vendor.durationPricing.priceLabel")}</Label>
          <Input
            type="number"
            min="0"
            value={d.price}
            onChange={(e) => setD({ ...d, price: e.target.value })}
            placeholder="150"
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs">{t("vendor.durationPricing.nameLabel")}</Label>
          <Input
            value={d.nameRo}
            onChange={(e) => setD({ ...d, nameRo: e.target.value })}
            placeholder={t("vendor.durationPricing.namePlaceholder")}
            className="mt-1"
            maxLength={120}
          />
        </div>
      </div>

      {/* Scope-specific fields */}
      {d.scope === "specific_day" && (
        <div>
          <Label className="text-xs">{t("vendor.durationPricing.dayLabel")}</Label>
          <select
            value={d.scopeDayOfWeek}
            onChange={(e) =>
              setD({ ...d, scopeDayOfWeek: e.target.value })
            }
            className="mt-1 flex h-10 w-full rounded-md border border-border/50 bg-background px-3 text-sm"
          >
            {DAY_NAME_KEYS.map((dayKey, i) => (
              <option key={i} value={i}>
                {t(dayKey)}
              </option>
            ))}
          </select>
        </div>
      )}
      {d.scope === "evening" && (
        <div>
          <Label className="text-xs">{t("vendor.durationPricing.fromHourLabel")}</Label>
          <Input
            type="time"
            value={d.scopeFromTime}
            onChange={(e) =>
              setD({ ...d, scopeFromTime: e.target.value })
            }
            className="mt-1"
          />
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={onSave}
          disabled={saving}
          className="gap-1.5 bg-gold text-[#0D0D0D] hover:bg-gold-dark"
        >
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
          {t("common.save")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onCancel}
          disabled={saving}
        >
          <X className="h-3.5 w-3.5" /> {t("common.cancel")}
        </Button>
      </div>
    </div>
  );

  const renderGroup = (scope: Scope) => {
    const meta = SCOPE_META[scope];
    const Icon = meta.icon;
    const items = grouped[scope];
    const isAdding = addingScope === scope;

    return (
      <div key={scope} className="rounded-xl border border-border/40 bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Icon className={cn("h-4 w-4", meta.color)} />
            <h3 className={cn("font-heading text-base font-bold", meta.color)}>
              {t(meta.labelKey)}
            </h3>
            {scope !== "base" && items.length === 0 && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                {t("vendor.durationPricing.optional")}
              </span>
            )}
          </div>
          {!isAdding && (
            <Button
              size="sm"
              variant={scope === "base" ? "default" : "outline"}
              onClick={() => {
                setDraft(emptyDraft(scope));
                setAddingScope(scope);
              }}
              className={cn(
                "gap-1.5",
                scope === "base" && "bg-gold text-[#0D0D0D] hover:bg-gold-dark",
              )}
            >
              <Plus className="h-3.5 w-3.5" />
              {scope === "base"
                ? t("vendor.durationPricing.addRate")
                : t("vendor.durationPricing.addOverride")}
            </Button>
          )}
        </div>

        {scope === "base" && items.length === 0 && !isAdding && (
          <p className="mt-3 text-xs text-muted-foreground">
            {t("vendor.durationPricing.baseHint")}
          </p>
        )}

        {isAdding && (
          <div className="mt-4">
            {renderDraftForm(
              draft,
              setDraft,
              createPackage,
              () => {
                setAddingScope(null);
                setDraft(emptyDraft());
              },
            )}
          </div>
        )}

        {items.length > 0 && (
          <div className="mt-3 space-y-2">
            {items.map((pkg) => {
              const isEditing = editingId === pkg.id;
              const totalMin =
                (pkg.durationHours ?? 0) * 60 + (pkg.durationMinutes ?? 0);
              const durationLabel =
                totalMin > 0 ? formatDuration(totalMin) : "—";
              const scopeInfo = scopeDescription(pkg, t);

              if (isEditing) {
                return (
                  <div key={pkg.id}>
                    {renderDraftForm(
                      editDraft,
                      setEditDraft,
                      () => updatePackage(pkg.id),
                      () => setEditingId(null),
                    )}
                  </div>
                );
              }

              return (
                <div
                  key={pkg.id}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-border/40 bg-background/40 px-4 py-3 transition-colors hover:border-gold/30"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                        scope === "base"
                          ? "bg-gold/10 text-gold"
                          : "bg-accent text-foreground",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-heading text-base font-bold">
                        {durationLabel}
                        {pkg.price != null && (
                          <span className="ml-2 text-gold">
                            {pkg.price}€
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {pkg.nameRo && <span>{pkg.nameRo}</span>}
                        {pkg.nameRo && scopeInfo && <span> · </span>}
                        {scopeInfo}
                      </p>
                    </div>
                  </div>
                  <div className="ml-auto flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => startEdit(pkg)}
                      className="gap-1 text-muted-foreground hover:text-foreground"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      {t("common.edit")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => deletePackage(pkg.id)}
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Intro */}
      <div className="rounded-xl border border-border/40 bg-card p-6">
        <h2 className="font-heading text-lg font-bold">{t("dashboard.rates")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("vendor.durationPricing.introText")}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          {t("vendor.durationPricing.introTip")}
        </p>
      </div>

      <EventPricingManager artistId={artistId} />

      {renderGroup("base")}
      {renderGroup("weekend")}
      {renderGroup("evening")}
      {renderGroup("specific_day")}
      {grouped.weekday.length > 0 && renderGroup("weekday")}
    </div>
  );
}
