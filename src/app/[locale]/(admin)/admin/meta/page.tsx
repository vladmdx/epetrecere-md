"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Save, Loader2, FileText, Wrench } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface PageMeta {
  id: number;
  path: string;
  label: string;
  title: string | null;
  description: string | null;
  groupName: string | null;
}

const GROUP_LABELS: Record<string, { label: string; icon: typeof FileText }> = {
  pages: { label: "Pagini", icon: FileText },
  tools: { label: "Instrumente Utile", icon: Wrench },
};

export default function AdminMetaPage() {
  const [items, setItems] = useState<PageMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<
    Record<number, { title: string; description: string }>
  >({});

  async function load() {
    try {
      const res = await fetch("/api/admin/page-meta", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data: PageMeta[] = await res.json();
      setItems(data);
      const draftMap: Record<number, { title: string; description: string }> = {};
      for (const r of data) {
        draftMap[r.id] = {
          title: r.title || "",
          description: r.description || "",
        };
      }
      setDrafts(draftMap);
    } catch {
      toast.error("Nu s-au putut încărca metadatele");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function saveOne(id: number) {
    const draft = drafts[id];
    if (!draft) return;
    setSaving(id);
    try {
      const res = await fetch("/api/admin/page-meta", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          title: draft.title.trim() || null,
          description: draft.description.trim() || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Salvare eșuată");
        return;
      }
      toast.success("Salvat");
      const updated = await res.json();
      setItems((prev) => prev.map((p) => (p.id === id ? updated : p)));
    } finally {
      setSaving(null);
    }
  }

  function updateDraft(id: number, field: "title" | "description", value: string) {
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...prev[id], [field]: value },
    }));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-gold" />
      </div>
    );
  }

  // Group by groupName
  const grouped = items.reduce<Record<string, PageMeta[]>>((acc, item) => {
    const key = item.groupName || "other";
    (acc[key] ??= []).push(item);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Meta Pagini</h1>
        <p className="text-sm text-muted-foreground">
          Editează titlul (Google &lt;title&gt;) și meta descrierea pentru pagini și
          instrumente. Las-o goală pentru a folosi varianta hardcoded din cod.
        </p>
      </div>

      {Object.entries(grouped).map(([group, list]) => {
        const meta = GROUP_LABELS[group] || { label: group, icon: FileText };
        const Icon = meta.icon;
        return (
          <section key={group} className="space-y-3">
            <div className="flex items-center gap-2">
              <Icon className="h-5 w-5 text-gold" />
              <h2 className="font-heading text-lg font-bold">{meta.label}</h2>
              <span className="text-xs text-muted-foreground">
                ({list.length})
              </span>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              {list.map((item) => {
                const draft = drafts[item.id] || { title: "", description: "" };
                const dirty =
                  (draft.title || "") !== (item.title || "") ||
                  (draft.description || "") !== (item.description || "");
                return (
                  <Card
                    key={item.id}
                    className={cn(
                      "transition-colors",
                      dirty && "border-gold/50 bg-gold/[0.02]",
                    )}
                  >
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{item.label}</p>
                          <p className="text-[11px] text-muted-foreground font-mono truncate">
                            {item.path}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => saveOne(item.id)}
                          disabled={saving === item.id || !dirty}
                          className="gap-1.5 bg-gold text-[#0D0D0D] hover:bg-gold-dark shrink-0"
                        >
                          {saving === item.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Save className="h-3.5 w-3.5" />
                          )}
                          Salvează
                        </Button>
                      </div>

                      <div>
                        <Label className="text-xs">Meta titlu (max 60)</Label>
                        <Input
                          value={draft.title}
                          onChange={(e) => updateDraft(item.id, "title", e.target.value)}
                          maxLength={70}
                          placeholder="Lasă gol pentru titlul implicit"
                          className="text-sm"
                        />
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          {draft.title.length}/60
                        </p>
                      </div>

                      <div>
                        <Label className="text-xs">Meta descriere (max 160)</Label>
                        <textarea
                          value={draft.description}
                          onChange={(e) =>
                            updateDraft(item.id, "description", e.target.value)
                          }
                          maxLength={200}
                          rows={2}
                          placeholder="Lasă gol pentru descrierea implicită"
                          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        />
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          {draft.description.length}/160
                        </p>
                      </div>

                      {(draft.title || draft.description) && (
                        <div className="rounded-md border border-border/40 bg-background p-2.5">
                          <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-0.5">
                            Previzualizare Google
                          </p>
                          <p className="text-blue-500 text-sm font-medium leading-tight truncate">
                            {draft.title || "(titlu implicit)"}
                          </p>
                          <p className="text-emerald-700 dark:text-emerald-400 text-[11px]">
                            epetrecere.md{item.path}
                          </p>
                          <p className="text-muted-foreground text-[11px] mt-0.5 line-clamp-2">
                            {draft.description || "(descriere implicită)"}
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
