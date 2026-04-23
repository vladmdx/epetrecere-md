"use client";

// AI event-timeline widget — renders the current timeline, offers
// "Generate with AI" and lets the user tweak the times/labels inline.
// The timeline is stored on event_plans.timeline and returned by the
// plan's server loader — we accept it as a prop for initial render.

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sparkles, Loader2, Plus, Trash2, Save, Clock } from "lucide-react";
import { toast } from "sonner";

interface TimelineItem {
  time: string;
  label: string;
  durationMin: number;
}

interface Props {
  planId: number;
  initial: TimelineItem[];
}

export function EventTimeline({ planId, initial }: Props) {
  const [items, setItems] = useState<TimelineItem[]>(initial);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  async function generate() {
    setGenerating(true);
    try {
      const res = await fetch("/api/ai/event-timeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "AI indisponibil");
        return;
      }
      const data = await res.json();
      setItems(data.items);
      toast.success("Agendă generată cu AI");
    } finally {
      setGenerating(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/ai/event-timeline", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, items }),
      });
      if (!res.ok) {
        toast.error("Nu am putut salva");
        return;
      }
      toast.success("Agenda salvată");
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  function updateItem(i: number, patch: Partial<TimelineItem>) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }

  function removeItem(i: number) {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  function addItem() {
    const last = items[items.length - 1];
    const nextTime = last
      ? addMinutesToTime(last.time, last.durationMin + 15)
      : "14:00";
    setItems((prev) => [
      ...prev,
      { time: nextTime, label: "Moment nou", durationMin: 30 },
    ]);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4 text-gold" />
              Agenda evenimentului
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {items.length > 0
                ? "Editează orele și denumirile sau regenerează cu AI."
                : "Generează agenda cu AI pe baza datelor evenimentului, apoi ajustează după preferințe."}
            </p>
          </div>
          <div className="flex gap-2">
            {editing && items.length > 0 && (
              <Button
                onClick={save}
                disabled={saving}
                size="sm"
                className="gap-1.5 bg-gold text-[#0D0D0D] hover:bg-gold-dark"
              >
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                Salvează
              </Button>
            )}
            {items.length > 0 && !editing && (
              <Button
                onClick={() => setEditing(true)}
                size="sm"
                variant="outline"
                className="gap-1.5"
              >
                Editează
              </Button>
            )}
            <Button
              onClick={generate}
              disabled={generating}
              size="sm"
              variant={items.length > 0 ? "outline" : "default"}
              className={
                items.length > 0
                  ? "gap-1.5"
                  : "gap-1.5 bg-gold text-[#0D0D0D] hover:bg-gold-dark"
              }
            >
              {generating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {items.length > 0 ? "Regenerează" : "Generează cu AI"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/40 p-6 text-center">
            <Sparkles className="mx-auto h-8 w-8 text-gold/60" />
            <p className="mt-3 text-sm text-muted-foreground">
              Nicio agendă încă. Claude va propune un program complet pe
              baza tipului evenimentului, orei de început și numărului de
              invitați.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((it, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-lg border border-border/40 bg-muted/20 p-3"
              >
                <div className="shrink-0">
                  {editing ? (
                    <Input
                      type="time"
                      value={it.time}
                      onChange={(e) => updateItem(i, { time: e.target.value })}
                      className="w-24 font-mono text-sm"
                    />
                  ) : (
                    <div className="w-20 font-mono text-base font-bold text-gold">
                      {it.time}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  {editing ? (
                    <Input
                      value={it.label}
                      onChange={(e) => updateItem(i, { label: e.target.value })}
                      className="text-sm"
                    />
                  ) : (
                    <p className="font-medium">{it.label}</p>
                  )}
                </div>
                <div className="shrink-0 text-xs text-muted-foreground">
                  {editing ? (
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        min={0}
                        max={360}
                        value={it.durationMin}
                        onChange={(e) =>
                          updateItem(i, {
                            durationMin: Number(e.target.value) || 0,
                          })
                        }
                        className="w-16 text-right text-xs"
                      />
                      <span>min</span>
                    </div>
                  ) : (
                    <span>{it.durationMin} min</span>
                  )}
                </div>
                {editing && (
                  <button
                    onClick={() => removeItem(i)}
                    aria-label="Șterge"
                    className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
            {editing && (
              <Button
                onClick={addItem}
                size="sm"
                variant="outline"
                className="w-full gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                Adaugă moment
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
}
