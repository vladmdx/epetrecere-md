"use client";

// M4 — Checklist sub-view for the event planner. Groups items by category,
// lets the user tick them off, add custom items and delete any.

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, Clock, Loader2 } from "lucide-react";
import { CATEGORY_LABELS } from "@/lib/planner/templates";
import { cn } from "@/lib/utils";

export interface ChecklistItem {
  id: number;
  title: string;
  category: string | null;
  priority: "low" | "medium" | "high";
  dueDaysBefore: number | null;
  done: boolean;
  doneAt: string | null;
  sortOrder: number | null;
}

interface Props {
  planId: number;
  eventDate: string | null;
  items: ChecklistItem[];
  onChange: (items: ChecklistItem[]) => void;
}

const PRIORITY_COLOR: Record<ChecklistItem["priority"], string> = {
  high: "border-red-500/40 bg-red-500/5 text-red-500",
  medium: "border-amber-500/40 bg-amber-500/5 text-amber-500",
  low: "border-emerald-500/40 bg-emerald-500/5 text-emerald-500",
};

const PRIORITY_LABEL: Record<ChecklistItem["priority"], string> = {
  high: "Urgent",
  medium: "Mediu",
  low: "Relaxat",
};

export function ChecklistView({ planId, eventDate, items, onChange }: Props) {
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState<string>("logistics");
  const [newPriority, setNewPriority] = useState<ChecklistItem["priority"]>("medium");
  const [adding, setAdding] = useState(false);

  // Compute days-to-event so we can flag overdue items.
  const daysToEvent = useMemo(() => {
    if (!eventDate) return null;
    const target = new Date(eventDate).getTime();
    const diff = Math.ceil((target - Date.now()) / (1000 * 60 * 60 * 24));
    return diff;
  }, [eventDate]);

  // Group by category for display.
  const grouped = useMemo(() => {
    const byCategory: Record<string, ChecklistItem[]> = {};
    for (const item of items) {
      const key = item.category || "other";
      if (!byCategory[key]) byCategory[key] = [];
      byCategory[key].push(item);
    }
    return Object.entries(byCategory).map(([category, list]) => ({
      category,
      label: CATEGORY_LABELS[category] || category,
      items: list,
    }));
  }, [items]);

  const doneCount = items.filter((i) => i.done).length;
  const progress = items.length > 0 ? Math.round((doneCount / items.length) * 100) : 0;

  async function toggleDone(item: ChecklistItem) {
    // Optimistic update
    const next = items.map((i) =>
      i.id === item.id ? { ...i, done: !i.done, doneAt: !i.done ? new Date().toISOString() : null } : i,
    );
    onChange(next);

    const res = await fetch(`/api/event-plans/${planId}/checklist/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: !item.done }),
    });
    if (!res.ok) {
      toast.error("Nu am putut actualiza.");
      onChange(items);
    }
  }

  async function deleteItem(item: ChecklistItem) {
    const prev = items;
    onChange(items.filter((i) => i.id !== item.id));
    const res = await fetch(`/api/event-plans/${planId}/checklist/${item.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast.error("Nu am putut șterge.");
      onChange(prev);
    }
  }

  async function addItem() {
    if (newTitle.trim().length < 1) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/event-plans/${planId}/checklist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle.trim(),
          category: newCategory,
          priority: newPriority,
        }),
      });
      if (!res.ok) {
        toast.error("Eroare la adăugare.");
        return;
      }
      const data = await res.json();
      onChange([...items, data.item]);
      setNewTitle("");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Progress bar */}
      <div className="rounded-xl border border-border/40 bg-card p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">Progres</span>
          <span className="text-muted-foreground">
            {doneCount} din {items.length} completate ({progress}%)
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-gold transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Add new item */}
      <div className="rounded-xl border border-border/40 bg-card p-4">
        <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">
          Adaugă sarcină
        </p>
        <div className="flex flex-wrap gap-2">
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Ex: Cumpără verighetele"
            onKeyDown={(e) => e.key === "Enter" && addItem()}
            className="min-w-[220px] flex-1"
          />
          <Select value={newCategory} onValueChange={(v) => setNewCategory(v ?? "")}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={newPriority}
            onValueChange={(v) => setNewPriority(v as ChecklistItem["priority"])}
          >
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="high">Urgent</SelectItem>
              <SelectItem value="medium">Mediu</SelectItem>
              <SelectItem value="low">Relaxat</SelectItem>
            </SelectContent>
          </Select>
          <Button
            onClick={addItem}
            disabled={adding}
            className="gap-1 bg-gold text-background hover:bg-gold-dark"
          >
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Adaugă
          </Button>
        </div>
      </div>

      {/* Grouped lists */}
      {grouped.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">Checklist gol.</p>
      ) : (
        grouped.map(({ category, label, items: list }) => (
          <div key={category} className="rounded-xl border border-border/40 bg-card p-4">
            <h3 className="mb-3 font-heading text-base font-semibold">{label}</h3>
            <ul className="space-y-2">
              {list.map((item) => {
                const isOverdue =
                  !item.done &&
                  daysToEvent !== null &&
                  item.dueDaysBefore !== null &&
                  daysToEvent < item.dueDaysBefore;

                return (
                  <li
                    key={item.id}
                    className="flex items-start gap-3 rounded-lg border border-border/20 px-3 py-2"
                  >
                    <Checkbox
                      checked={item.done}
                      onCheckedChange={() => toggleDone(item)}
                      className="mt-0.5"
                    />
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "text-sm",
                          item.done && "text-muted-foreground line-through",
                        )}
                      >
                        {item.title}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span
                          className={cn(
                            "rounded-full border px-1.5 py-0.5 text-[10px]",
                            PRIORITY_COLOR[item.priority],
                          )}
                        >
                          {PRIORITY_LABEL[item.priority]}
                        </span>
                        {item.dueDaysBefore !== null && (
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px]",
                              isOverdue
                                ? "border-red-500/40 bg-red-500/5 text-red-500"
                                : "border-border/40 text-muted-foreground",
                            )}
                          >
                            <Clock className="h-2.5 w-2.5" />
                            {item.dueDaysBefore}z înainte
                            {isOverdue && " · întârziat"}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => deleteItem(item)}
                      className="text-muted-foreground transition-colors hover:text-red-500"
                      aria-label="Șterge"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))
      )}
    </div>
  );
}
