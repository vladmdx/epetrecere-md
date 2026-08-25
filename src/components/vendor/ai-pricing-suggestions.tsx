"use client";

// AI Pricing Suggestions card — vendor clicks "Analizează cu AI", we hit
// /api/ai/pricing-suggestions and render the structured response with
// priority badges + verdict + seasonal multiplier table.

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, TrendingUp, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useLocale } from "@/hooks/use-locale";

interface Suggestion {
  title: string;
  reason: string;
  action: string;
  priority: "high" | "medium" | "low";
}

interface AiResult {
  marketSummary: string;
  suggestions: Suggestion[];
  seasonalMultipliers: {
    weekend: number;
    summer: number;
    december: number;
    newYear: number;
  };
  verdictScurt: string;
}

export function AiPricingSuggestions() {
  const { t } = useLocale();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AiResult | null>(null);

  async function run() {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/pricing-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || t("vendorAiPricing.unavailable"));
        return;
      }
      const result = (await res.json()) as AiResult;
      setData(result);
    } finally {
      setLoading(false);
    }
  }

  function formatMultiplier(m: number): string {
    if (m > 1) return `+${Math.round((m - 1) * 100)}%`;
    if (m < 1) return `${Math.round((m - 1) * 100)}%`;
    return "0%";
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-gold" />
              {t("vendorAiPricing.title")}
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("vendorAiPricing.description")}
            </p>
          </div>
          <Button
            onClick={run}
            disabled={loading}
            size="sm"
            className="gap-1.5 bg-gold text-[#0D0D0D] hover:bg-gold-dark"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {data ? t("vendorAiPricing.reanalyze") : t("vendorAiPricing.analyze")}
          </Button>
        </div>
      </CardHeader>
      {data && (
        <CardContent className="space-y-4">
          {/* Verdict */}
          <div className="flex items-start gap-2 rounded-lg border border-gold/30 bg-gold/5 p-3">
            <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
            <div>
              <p className="text-sm font-semibold text-gold">{t("vendorAiPricing.verdict")}</p>
              <p className="mt-0.5 text-sm">{data.verdictScurt}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {data.marketSummary}
              </p>
            </div>
          </div>

          {/* Seasonal multipliers */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("vendorAiPricing.multipliersTitle")}
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <MultiplierBadge
                label={t("vendorAiPricing.weekend")}
                value={formatMultiplier(data.seasonalMultipliers.weekend)}
                positive={data.seasonalMultipliers.weekend > 1}
              />
              <MultiplierBadge
                label={t("vendorAiPricing.summer")}
                value={formatMultiplier(data.seasonalMultipliers.summer)}
                positive={data.seasonalMultipliers.summer > 1}
              />
              <MultiplierBadge
                label={t("vendorAiPricing.december")}
                value={formatMultiplier(data.seasonalMultipliers.december)}
                positive={data.seasonalMultipliers.december > 1}
              />
              <MultiplierBadge
                label={t("vendorAiPricing.newYear")}
                value={formatMultiplier(data.seasonalMultipliers.newYear)}
                positive={data.seasonalMultipliers.newYear > 1}
              />
            </div>
          </div>

          {/* Suggestions */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("vendorAiPricing.suggestionsTitle")}
            </p>
            <div className="space-y-2">
              {data.suggestions.map((s, i) => (
                <div
                  key={i}
                  className={cn(
                    "rounded-lg border p-3",
                    s.priority === "high"
                      ? "border-red-500/30 bg-red-500/5"
                      : s.priority === "medium"
                        ? "border-amber-500/30 bg-amber-500/5"
                        : "border-border/40 bg-muted/30",
                  )}
                >
                  <div className="flex items-start gap-2">
                    <AlertCircle
                      className={cn(
                        "mt-0.5 h-4 w-4 shrink-0",
                        s.priority === "high"
                          ? "text-red-400"
                          : s.priority === "medium"
                            ? "text-amber-500"
                            : "text-muted-foreground",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm">{s.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {s.reason}
                      </p>
                      <p className="mt-2 text-xs font-medium text-gold">
                        → {s.action}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function MultiplierBadge({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive: boolean;
}) {
  return (
    <div className="rounded-lg border border-border/40 bg-background p-2.5 text-center">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 font-heading text-lg font-bold",
          positive ? "text-emerald-400" : "text-muted-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}
