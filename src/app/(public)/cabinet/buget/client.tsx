"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Trash2,
  Wallet,
  TrendingUp,
  AlertCircle,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

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

// Default tracker pre-populated with typical wedding categories
const DEFAULT_CATEGORIES: BudgetCategory[] = [
  {
    id: "venue",
    label: "Sală & Închiriere",
    items: [
      { id: "venue-rental", label: "Chirie sală", estimated: 1500, actual: 0, paid: false },
      { id: "venue-tables", label: "Mese & scaune extra", estimated: 200, actual: 0, paid: false },
    ],
  },
  {
    id: "food",
    label: "Mâncare & Băuturi",
    items: [
      { id: "menu", label: "Meniu principal", estimated: 4500, actual: 0, paid: false },
      { id: "drinks", label: "Băuturi", estimated: 1200, actual: 0, paid: false },
      { id: "cake", label: "Tort de nuntă", estimated: 300, actual: 0, paid: false },
      { id: "candy-bar", label: "Candy bar", estimated: 250, actual: 0, paid: false },
    ],
  },
  {
    id: "attire",
    label: "Îmbrăcăminte",
    items: [
      { id: "bride-dress", label: "Rochia miresei", estimated: 900, actual: 0, paid: false },
      { id: "groom-suit", label: "Costum mire", estimated: 400, actual: 0, paid: false },
      { id: "shoes", label: "Pantofi", estimated: 200, actual: 0, paid: false },
      { id: "accessories", label: "Accesorii", estimated: 150, actual: 0, paid: false },
    ],
  },
  {
    id: "rings-jewelry",
    label: "Inele & Bijuterii",
    items: [
      { id: "rings", label: "Verighete", estimated: 700, actual: 0, paid: false },
      { id: "jewelry", label: "Bijuterii mireasă", estimated: 200, actual: 0, paid: false },
    ],
  },
  {
    id: "media",
    label: "Foto & Video",
    items: [
      { id: "photographer", label: "Fotograf", estimated: 700, actual: 0, paid: false },
      { id: "videographer", label: "Videograf", estimated: 500, actual: 0, paid: false },
      { id: "album", label: "Album foto", estimated: 150, actual: 0, paid: false },
    ],
  },
  {
    id: "entertainment",
    label: "Muzică & Show",
    items: [
      { id: "band", label: "Formație / DJ", estimated: 800, actual: 0, paid: false },
      { id: "mc", label: "Moderator", estimated: 300, actual: 0, paid: false },
      { id: "show", label: "Show program", estimated: 400, actual: 0, paid: false },
    ],
  },
  {
    id: "decor",
    label: "Decor & Flori",
    items: [
      { id: "hall-decor", label: "Decor sală", estimated: 600, actual: 0, paid: false },
      { id: "flowers", label: "Aranjamente florale", estimated: 400, actual: 0, paid: false },
      { id: "bride-bouquet", label: "Buchetul miresei", estimated: 80, actual: 0, paid: false },
    ],
  },
  {
    id: "beauty",
    label: "Înfrumusețare",
    items: [
      { id: "makeup", label: "Machiaj", estimated: 100, actual: 0, paid: false },
      { id: "hair", label: "Coafură", estimated: 80, actual: 0, paid: false },
    ],
  },
  {
    id: "other",
    label: "Diverse",
    items: [
      { id: "invitations", label: "Invitații & papetărie", estimated: 150, actual: 0, paid: false },
      { id: "transport", label: "Transport / limuzină", estimated: 250, actual: 0, paid: false },
      { id: "favors", label: "Mărțișoare invitați", estimated: 200, actual: 0, paid: false },
      { id: "church", label: "Cununia religioasă", estimated: 100, actual: 0, paid: false },
    ],
  },
];

const STORAGE_KEY = "epetrecere-budget-tracker";

function formatEUR(n: number): string {
  return new Intl.NumberFormat("ro-RO", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

export function BudgetTrackerClient() {
  const [categories, setCategories] =
    useState<BudgetCategory[]>(DEFAULT_CATEGORIES);
  const [totalBudget, setTotalBudget] = useState(15000);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
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
    const label = prompt("Numele cheltuielii:");
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

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 lg:px-8">
      <header>
        <p className="text-sm font-medium uppercase tracking-[3px] text-gold">
          Planificare
        </p>
        <h1 className="font-heading text-3xl font-bold md:text-4xl">
          Buget nuntă — tracker
        </h1>
        <p className="mt-2 text-sm text-muted-foreground md:text-base">
          Urmărește cheltuielile pe categorii: estimat, real și plătit. Datele
          se salvează automat în browser.
        </p>
      </header>

      {/* Summary */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              Buget total
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
              Estimat
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
              Cheltuit real
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
              Plătit
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
          Ai depășit bugetul cu{" "}
          <strong>{formatEUR(stats.actual - totalBudget)}</strong>
        </div>
      )}

      {/* Progress bar */}
      <Card className="mt-4">
        <CardContent className="p-5">
          <div className="mb-2 flex justify-between text-sm">
            <span className="text-muted-foreground">Utilizare buget</span>
            <span className="font-medium">
              {((stats.actual / Math.max(1, totalBudget)) * 100).toFixed(0)}%
            </span>
          </div>
          <Progress
            value={(stats.actual / Math.max(1, totalBudget)) * 100}
            className="h-2"
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Rămas: <strong>{formatEUR(stats.remaining)}</strong>
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
                        Cheltuială
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
                        Estimat €
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
                        Real €
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
                      Plătit
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
                  <Plus className="h-3 w-3" /> Adaugă cheltuială
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
