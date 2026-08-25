"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Trash2,
  Wallet,
  TrendingUp,
  AlertCircle,
  Check,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/hooks/use-locale";

interface BudgetItem {
  id: string;
  label: string;
  estimated: number;
  actual: number;
  paid: boolean;
  notes?: string;
}

interface BudgetCategory {
  id: string;
  label: string;
  items: BudgetItem[];
}

// Default tracker pre-populated with typical wedding categories. The labels
// are i18n keys resolved at mount, so a RU/EN reader is seeded in their own
// language; every label stays editable afterwards.
interface DefaultCategory {
  id: string;
  labelKey: string;
  items: { id: string; labelKey: string; estimated: number }[];
}

const DEFAULT_CATEGORIES: DefaultCategory[] = [
  {
    id: "venue",
    labelKey: "cabinet.budget.catVenue",
    items: [
      { id: "venue-rental", labelKey: "cabinet.budget.itemVenueRental", estimated: 1500 },
      { id: "venue-tables", labelKey: "cabinet.budget.itemTables", estimated: 200 },
    ],
  },
  {
    id: "food",
    labelKey: "cabinet.budget.catFood",
    items: [
      { id: "menu", labelKey: "cabinet.budget.itemMenu", estimated: 4500 },
      { id: "drinks", labelKey: "cabinet.budget.itemDrinks", estimated: 1200 },
      { id: "cake", labelKey: "calc.wedding.cat.cake.label", estimated: 300 },
      { id: "candy-bar", labelKey: "cabinet.budget.itemCandyBar", estimated: 250 },
    ],
  },
  {
    id: "attire",
    labelKey: "cabinet.budget.catAttire",
    items: [
      { id: "bride-dress", labelKey: "calc.wedding.cat.brideDress.label", estimated: 900 },
      { id: "groom-suit", labelKey: "calc.wedding.cat.groomSuit.label", estimated: 400 },
      { id: "shoes", labelKey: "cabinet.budget.itemShoes", estimated: 200 },
      { id: "accessories", labelKey: "cabinet.budget.itemAccessories", estimated: 150 },
    ],
  },
  {
    id: "rings-jewelry",
    labelKey: "cabinet.budget.catRings",
    items: [
      { id: "rings", labelKey: "cabinet.budget.itemRings", estimated: 700 },
      { id: "jewelry", labelKey: "cabinet.budget.itemBrideJewelry", estimated: 200 },
    ],
  },
  {
    id: "media",
    labelKey: "calc.wedding.cat.photoVideo.label",
    items: [
      { id: "photographer", labelKey: "cabinet.budget.itemPhotographer", estimated: 700 },
      { id: "videographer", labelKey: "cabinet.budget.itemVideographer", estimated: 500 },
      { id: "album", labelKey: "cabinet.budget.itemAlbum", estimated: 150 },
    ],
  },
  {
    id: "entertainment",
    labelKey: "cabinet.budget.catEntertainment",
    items: [
      { id: "band", labelKey: "cabinet.budget.itemBand", estimated: 800 },
      { id: "mc", labelKey: "cabinet.budget.itemMc", estimated: 300 },
      { id: "show", labelKey: "cabinet.budget.itemShow", estimated: 400 },
    ],
  },
  {
    id: "decor",
    labelKey: "cabinet.budget.catDecor",
    items: [
      { id: "hall-decor", labelKey: "cabinet.budget.itemHallDecor", estimated: 600 },
      { id: "flowers", labelKey: "cabinet.budget.itemFlowers", estimated: 400 },
      { id: "bride-bouquet", labelKey: "cabinet.budget.itemBouquet", estimated: 80 },
    ],
  },
  {
    id: "beauty",
    labelKey: "cabinet.budget.catBeauty",
    items: [
      { id: "makeup", labelKey: "cabinet.budget.itemMakeup", estimated: 100 },
      { id: "hair", labelKey: "cabinet.budget.itemHair", estimated: 80 },
    ],
  },
  {
    id: "other",
    labelKey: "cabinet.budget.catOther",
    items: [
      { id: "invitations", labelKey: "calc.wedding.cat.invitations.label", estimated: 150 },
      { id: "transport", labelKey: "cabinet.budget.itemTransport", estimated: 250 },
      { id: "favors", labelKey: "cabinet.budget.itemFavors", estimated: 200 },
      { id: "church", labelKey: "cabinet.budget.itemChurch", estimated: 100 },
    ],
  },
];

/** Resolve the seed labels once, in the reader's language. */
function seedCategories(
  t: (key: string, vars?: Record<string, string | number>) => string,
): BudgetCategory[] {
  return DEFAULT_CATEGORIES.map((cat) => ({
    id: cat.id,
    label: t(cat.labelKey),
    items: cat.items.map((item) => ({
      id: item.id,
      label: t(item.labelKey),
      estimated: item.estimated,
      actual: 0,
      paid: false,
    })),
  }));
}

const STORAGE_KEY = "epetrecere-budget-tracker";

function formatEUR(n: number): string {
  return new Intl.NumberFormat("ro-RO", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

export function BudgetTrackerClient() {
  const { t } = useLocale();
  const [categories, setCategories] = useState<BudgetCategory[]>(() =>
    seedCategories(t),
  );
  const [totalBudget, setTotalBudget] = useState(15000);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Intentional sync-in-effect: load persisted budget from localStorage
    // on first mount. One-time hydration; setLoaded(true) guards the save
    // effect below from clobbering the stored value with defaults.
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.categories) setCategories(saved.categories);
        if (saved.totalBudget) setTotalBudget(saved.totalBudget);
      }
    } catch {
      // ignore
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ categories, totalBudget }),
    );
  }, [categories, totalBudget, loaded]);

  const stats = useMemo(() => {
    let estimated = 0;
    let actual = 0;
    let paid = 0;
    for (const cat of categories) {
      for (const item of cat.items) {
        estimated += item.estimated;
        actual += item.actual;
        if (item.paid) paid += item.actual;
      }
    }
    return { estimated, actual, paid, remaining: totalBudget - actual };
  }, [categories, totalBudget]);

  function updateItem(
    catId: string,
    itemId: string,
    patch: Partial<BudgetItem>,
  ) {
    setCategories((cats) =>
      cats.map((c) =>
        c.id === catId
          ? {
              ...c,
              items: c.items.map((i) =>
                i.id === itemId ? { ...i, ...patch } : i,
              ),
            }
          : c,
      ),
    );
  }

  function addItem(catId: string) {
    const label = prompt(t("cabinet.budget.promptName"));
    if (!label) return;
    setCategories((cats) =>
      cats.map((c) =>
        c.id === catId
          ? {
              ...c,
              items: [
                ...c.items,
                {
                  id: `${catId}-${Date.now()}`,
                  label,
                  estimated: 0,
                  actual: 0,
                  paid: false,
                },
              ],
            }
          : c,
      ),
    );
  }

  function removeItem(catId: string, itemId: string) {
    setCategories((cats) =>
      cats.map((c) =>
        c.id === catId
          ? { ...c, items: c.items.filter((i) => i.id !== itemId) }
          : c,
      ),
    );
  }

  const overBudget = stats.actual > totalBudget;

  // C-18 — Export budget as PDF (opens print dialog)
  function exportPDF() {
    const rows = categories.flatMap((cat) =>
      cat.items.map((item) => `
        <tr>
          <td style="padding:6px 8px;border-bottom:1px solid #333">${cat.label}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #333">${item.label}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #333;text-align:right">${item.estimated.toLocaleString()}€</td>
          <td style="padding:6px 8px;border-bottom:1px solid #333;text-align:right">${item.actual.toLocaleString()}€</td>
          <td style="padding:6px 8px;border-bottom:1px solid #333;text-align:center">${item.paid ? "✓" : "—"}</td>
        </tr>
      `),
    );
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${t("cabinet.budget.pdfDocTitle")}</title>
      <style>body{font-family:system-ui,sans-serif;background:#0D0D0D;color:#FAF8F2;padding:40px}
      h1{color:#C9A84C;margin-bottom:4px}table{width:100%;border-collapse:collapse;margin-top:20px}
      th{text-align:left;padding:8px;border-bottom:2px solid #C9A84C;color:#C9A84C;font-size:13px}
      td{font-size:13px}.summary{display:flex;gap:24px;margin-top:16px}
      .box{background:#1A1A2E;padding:16px;border-radius:8px;border:1px solid rgba(201,168,76,0.15)}
      .box h3{font-size:12px;color:#A0A0B0;margin:0 0 4px}.box p{font-size:20px;margin:0;font-weight:bold;color:#C9A84C}
      @media print{body{background:white;color:black}th{color:#333;border-color:#333}td{border-color:#ccc}.box{background:#f5f5f5;border-color:#ddd}.box p{color:#333}}</style></head>
      <body><h1>${t("cabinet.budget.pdfHeading")}</h1><p style="color:#A0A0B0;margin:0 0 12px">ePetrecere.md — ${new Date().toLocaleDateString("ro-RO")}</p>
      <div class="summary">
        <div class="box"><h3>${t("cabinet.budget.pdfTotalBudget")}</h3><p>${totalBudget.toLocaleString()}€</p></div>
        <div class="box"><h3>${t("cabinet.budget.estimated")}</h3><p>${stats.estimated.toLocaleString()}€</p></div>
        <div class="box"><h3>${t("cabinet.budget.pdfSpent")}</h3><p>${stats.actual.toLocaleString()}€</p></div>
        <div class="box"><h3>${t("cabinet.budget.paid")}</h3><p>${stats.paid.toLocaleString()}€</p></div>
      </div>
      <table><thead><tr><th>${t("catalogFilters.category")}</th><th>${t("cabinet.budget.colExpense")}</th><th style="text-align:right">${t("cabinet.budget.estimated")}</th><th style="text-align:right">${t("cabinet.budget.pdfColActual")}</th><th style="text-align:center">${t("cabinet.budget.paid")}</th></tr></thead>
      <tbody>${rows.join("")}</tbody></table></body></html>`;
    const w = window.open("", "_blank");
    if (w) {
      w.document.write(html);
      w.document.close();
      setTimeout(() => w.print(), 400);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 lg:px-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-[3px] text-gold">
            {t("cabinet.budget.eyebrow")}
          </p>
          <h1 className="font-heading text-3xl font-bold md:text-4xl">
            {t("cabinet.budget.title")}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground md:text-base">
            {t("cabinet.budget.subtitle")}
          </p>
        </div>
        <Button variant="outline" className="gap-2 border-gold/30 text-gold hover:bg-gold/10 shrink-0" onClick={exportPDF}>
          <Download className="h-4 w-4" /> {t("cabinet.budget.exportPdf")}
        </Button>
      </header>

      {/* Summary */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              {t("cabinet.budget.totalBudget")}
              <Wallet className="h-4 w-4" />
            </div>
            <Input
              type="number"
              value={totalBudget}
              onChange={(e) =>
                setTotalBudget(Math.max(0, Number(e.target.value) || 0))
              }
              className="mt-2"
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              {t("cabinet.budget.estimated")}
              <TrendingUp className="h-4 w-4" />
            </div>
            <div className="mt-2 font-accent text-2xl font-bold">
              {formatEUR(stats.estimated)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              {t("cabinet.budget.actualSpent")}
              <TrendingUp className="h-4 w-4" />
            </div>
            <div
              className={`mt-2 font-accent text-2xl font-bold ${
                overBudget ? "text-destructive" : ""
              }`}
            >
              {formatEUR(stats.actual)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              {t("cabinet.budget.paid")}
              <Check className="h-4 w-4" />
            </div>
            <div className="mt-2 font-accent text-2xl font-bold text-success">
              {formatEUR(stats.paid)}
            </div>
          </CardContent>
        </Card>
      </div>

      {overBudget && (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {t("cabinet.budget.overBudget")}{" "}
          <strong>{formatEUR(stats.actual - totalBudget)}</strong>
        </div>
      )}

      {/* Progress bar */}
      <Card className="mt-4">
        <CardContent className="p-5">
          <div className="mb-2 flex justify-between text-sm">
            <span className="text-muted-foreground">
              {t("cabinet.budget.usage")}
            </span>
            <span className="font-medium">
              {((stats.actual / Math.max(1, totalBudget)) * 100).toFixed(0)}%
            </span>
          </div>
          <Progress
            value={(stats.actual / Math.max(1, totalBudget)) * 100}
            className="h-2"
          />
          <p className="mt-2 text-xs text-muted-foreground">
            {t("cabinet.budget.remaining")}{" "}
            <strong>{formatEUR(stats.remaining)}</strong>
          </p>
        </CardContent>
      </Card>

      {/* Categories */}
      <div className="mt-8 space-y-4">
        {categories.map((cat) => {
          const catTotal = cat.items.reduce((a, i) => a + i.actual, 0);
          const catEstimated = cat.items.reduce(
            (a, i) => a + i.estimated,
            0,
          );
          return (
            <Card key={cat.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{cat.label}</span>
                  <Badge variant="secondary">
                    {formatEUR(catTotal)} / {formatEUR(catEstimated)}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {cat.items.map((item) => (
                  <div
                    key={item.id}
                    className="grid gap-2 rounded-lg border border-border/40 p-3 sm:grid-cols-[1fr_100px_100px_auto_auto]"
                  >
                    <div>
                      <Label className="text-xs text-muted-foreground">
                        {t("cabinet.budget.colExpense")}
                      </Label>
                      <Input
                        value={item.label}
                        onChange={(e) =>
                          updateItem(cat.id, item.id, { label: e.target.value })
                        }
                        className="mt-1 h-9"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">
                        {t("cabinet.budget.colEstimatedEur")}
                      </Label>
                      <Input
                        type="number"
                        value={item.estimated}
                        onChange={(e) =>
                          updateItem(cat.id, item.id, {
                            estimated: Number(e.target.value) || 0,
                          })
                        }
                        className="mt-1 h-9"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">
                        {t("cabinet.budget.colActualEur")}
                      </Label>
                      <Input
                        type="number"
                        value={item.actual}
                        onChange={(e) =>
                          updateItem(cat.id, item.id, {
                            actual: Number(e.target.value) || 0,
                          })
                        }
                        className="mt-1 h-9"
                      />
                    </div>
                    <label className="flex items-center gap-1.5 text-xs">
                      <input
                        type="checkbox"
                        checked={item.paid}
                        onChange={(e) =>
                          updateItem(cat.id, item.id, {
                            paid: e.target.checked,
                          })
                        }
                        className="h-4 w-4 accent-gold"
                      />
                      {t("cabinet.budget.paid")}
                    </label>
                    <button
                      type="button"
                      onClick={() => removeItem(cat.id, item.id)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addItem(cat.id)}
                  className="gap-1"
                >
                  <Plus className="h-3 w-3" /> {t("cabinet.budget.addExpense")}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
