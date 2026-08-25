"use client";

// Floating bar with bulk actions — appears when the admin has selected
// 1+ checkboxes in an artist/venue list. Fires /api/admin/bulk and
// calls `onComplete` (typically refetch) when done.

import { useState } from "react";
import {
  CheckCircle2,
  XCircle,
  Star,
  StarOff,
  Trash2,
  Loader2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useLocale } from "@/hooks/use-locale";

interface Props {
  entity: "artist" | "venue";
  selectedIds: number[];
  onClear: () => void;
  onComplete: () => void;
}

type Action = "activate" | "deactivate" | "feature" | "unfeature" | "delete";

export function BulkActionsBar({
  entity,
  selectedIds,
  onClear,
  onComplete,
}: Props) {
  const { t } = useLocale();
  const [busy, setBusy] = useState<Action | null>(null);
  if (selectedIds.length === 0) return null;

  async function run(action: Action) {
    if (
      action === "delete" &&
      !confirm(
        t("admin.bulk.deleteConfirm", {
          count: selectedIds.length,
          entity:
            entity === "artist"
              ? t("admin.bulk.entityArtists")
              : t("admin.bulk.entityVenues"),
        }),
      )
    ) {
      return;
    }
    setBusy(action);
    try {
      const res = await fetch("/api/admin/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity, ids: selectedIds, action }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || t("admin.bulk.actionError"));
        return;
      }
      const data = await res.json();
      toast.success(t("admin.bulk.updated", { count: data.affected }));
      onComplete();
      onClear();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 px-4">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-gold/30 bg-card/95 px-4 py-3 shadow-2xl backdrop-blur-md">
        <span className="text-sm font-medium">
          {t("admin.bulk.selected", { count: selectedIds.length })}
        </span>
        <span className="mx-1 h-4 w-px bg-border/50" />
        <button
          onClick={() => run("activate")}
          disabled={busy !== null}
          className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/15 px-2.5 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-500/25 disabled:opacity-50"
        >
          {busy === "activate" ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <CheckCircle2 className="h-3 w-3" />
          )}
          {t("admin.bulk.activate")}
        </button>
        <button
          onClick={() => run("deactivate")}
          disabled={busy !== null}
          className="inline-flex items-center gap-1 rounded-lg bg-muted px-2.5 py-1.5 text-xs font-medium hover:bg-muted/70 disabled:opacity-50"
        >
          {busy === "deactivate" ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <XCircle className="h-3 w-3" />
          )}
          {t("admin.bulk.deactivate")}
        </button>
        <button
          onClick={() => run("feature")}
          disabled={busy !== null}
          className="inline-flex items-center gap-1 rounded-lg bg-gold/15 px-2.5 py-1.5 text-xs font-medium text-gold hover:bg-gold/25 disabled:opacity-50"
        >
          {busy === "feature" ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Star className="h-3 w-3" />
          )}
          {t("admin.bulk.feature")}
        </button>
        <button
          onClick={() => run("unfeature")}
          disabled={busy !== null}
          className="inline-flex items-center gap-1 rounded-lg bg-muted px-2.5 py-1.5 text-xs font-medium hover:bg-muted/70 disabled:opacity-50"
        >
          {busy === "unfeature" ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <StarOff className="h-3 w-3" />
          )}
          {t("admin.bulk.unfeature")}
        </button>
        <button
          onClick={() => run("delete")}
          disabled={busy !== null}
          className="inline-flex items-center gap-1 rounded-lg bg-red-500/15 px-2.5 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/25 disabled:opacity-50"
        >
          {busy === "delete" ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Trash2 className="h-3 w-3" />
          )}
          {t("admin.bulk.delete")}
        </button>
        <span className="mx-1 h-4 w-px bg-border/50" />
        <button
          onClick={onClear}
          aria-label={t("admin.bulk.deselect")}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
