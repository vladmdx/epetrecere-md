"use client";

import { useEffect, useState } from "react";
import { Check, Calendar, RotateCcw, Download } from "lucide-react";
import { WEDDING_CHECKLIST } from "@/lib/wedding-checklist";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";

const STORAGE_KEY = "epetrecere-wedding-checklist";

export function ChecklistClient() {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const arr = JSON.parse(raw) as string[];
        setChecked(new Set(arr));
      }
    } catch {
      // ignore
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...checked]));
  }, [checked, loaded]);

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function reset() {
    if (confirm("Sigur vrei să resetezi întregul checklist?")) {
      setChecked(new Set());
    }
  }

  const totalItems = WEDDING_CHECKLIST.reduce(
    (acc, phase) => acc + phase.items.length,
    0,
  );
  const checkedCount = checked.size;
  const progress = totalItems > 0 ? (checkedCount / totalItems) * 100 : 0;

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 lg:px-8">
      <header className="text-center">
        <p className="mb-2 text-sm font-medium uppercase tracking-[3px] text-gold">
          Planificare nuntă
        </p>
        <h1 className="font-heading text-3xl font-bold md:text-4xl">
          Checklist 12 luni
        </h1>
        <p className="mt-2 text-sm text-muted-foreground md:text-base">
          Un ghid pas cu pas pentru planificarea nunții tale. Bifează ce ai
          făcut — progresul se salvează automat în browser.
        </p>
      </header>

      {/* Progress */}
      <Card className="mt-8">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Progres general
              </p>
              <p className="mt-1 font-accent text-3xl font-bold">
                {checkedCount} / {totalItems}
              </p>
            </div>
            <div className="text-right">
              <p className="font-accent text-2xl font-semibold text-gold">
                {progress.toFixed(0)}%
              </p>
              <p className="text-xs text-muted-foreground">complet</p>
            </div>
          </div>
          <Progress value={progress} className="mt-4 h-2" />
          <div className="mt-4 flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={reset}
              className="gap-1"
            >
              <RotateCcw className="h-3 w-3" /> Resetează
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Phases */}
      <div className="mt-8 space-y-6">
        {WEDDING_CHECKLIST.map((phase) => {
          const phaseChecked = phase.items.filter((i) =>
            checked.has(i.id),
          ).length;
          const phasePct = (phaseChecked / phase.items.length) * 100;
          return (
            <Card key={phase.id}>
              <CardContent className="p-6">
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gold/10 text-gold">
                      <Calendar className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="font-heading text-lg font-bold">
                        {phase.label}
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        {phase.description}
                      </p>
                    </div>
                  </div>
                  <div className="text-right text-xs">
                    <div className="font-medium text-foreground">
                      {phaseChecked} / {phase.items.length}
                    </div>
                    <div className="text-muted-foreground">
                      {phasePct.toFixed(0)}%
                    </div>
                  </div>
                </div>
                <Progress value={phasePct} className="mb-4 h-1" />
                <ul className="space-y-2">
                  {phase.items.map((item) => {
                    const isChecked = checked.has(item.id);
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => toggle(item.id)}
                          className="flex w-full items-start gap-3 rounded-lg border border-transparent px-3 py-2 text-left transition-all hover:border-border/40 hover:bg-card"
                        >
                          <span
                            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-all ${
                              isChecked
                                ? "border-gold bg-gold"
                                : "border-border"
                            }`}
                          >
                            {isChecked && (
                              <Check className="h-3 w-3 text-background" />
                            )}
                          </span>
                          <span
                            className={`text-sm ${
                              isChecked
                                ? "text-muted-foreground line-through"
                                : ""
                            }`}
                          >
                            {item.label}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
