"use client";

import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Badge } from "@/components/ui/badge";
import { Calendar, DollarSign, Loader2, User, Music, Ticket } from "lucide-react";
import { cn } from "@/lib/utils";
import { normalizeEventType, eventTypeLabel } from "@/lib/events/normalize";
import Link from "next/link";
import { toast } from "sonner";
import { useLocale } from "@/hooks/use-locale";

export interface CrmItem {
  id: string;
  rawId: number;
  type: "lead" | "booking" | "offer";
  name: string;
  phone: string;
  email: string | null;
  eventType: string | null;
  eventDate: string | null;
  location: string | null;
  guestCount: number | null;
  budget: number | null;
  status: string;
  rawStatus: string;
  source: string | null;
  score: number | null;
  message: string | null;
  artistName: string | null;
  createdAt: string;
}

const columns = [
  { id: "new", labelKey: "admin.kanban.stageNew", color: "bg-info" },
  { id: "contacted", labelKey: "admin.kanban.stageContacted", color: "bg-warning" },
  { id: "proposal_sent", labelKey: "admin.kanban.stageProposal", color: "bg-gold" },
  { id: "negotiation", labelKey: "admin.kanban.stageNegotiation", color: "bg-purple-500" },
  { id: "accepted", labelKey: "admin.kanban.stageAccepted", color: "bg-success" },
  { id: "confirmed", labelKey: "admin.kanban.stageConfirmed", color: "bg-success" },
];

const typeIconMap = {
  lead: User,
  booking: Ticket,
  offer: Music,
} as const;

const typeColorMap = {
  lead: "text-blue-400 bg-blue-500/10",
  booking: "text-purple-400 bg-purple-500/10",
  offer: "text-gold bg-gold/10",
} as const;

function ItemCard({ item }: { item: CrmItem }) {
  const score = item.score ?? 0;
  const Icon = typeIconMap[item.type];
  const detailUrl =
    item.type === "lead" ? `/admin/crm/${item.rawId}` : "/admin/cereri-oferte";

  return (
    <Link href={detailUrl}>
      <div className="rounded-lg border border-border/40 bg-card p-3 shadow-sm transition-all hover:border-gold/30 hover:shadow-md cursor-pointer">
        <div className="flex items-center justify-between mb-2 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md", typeColorMap[item.type])}>
              <Icon className="h-3.5 w-3.5" />
            </span>
            <span className="text-sm font-medium truncate">{item.name}</span>
          </div>
          {item.type === "lead" && (
            <span className={cn(
              "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
              score >= 70 ? "bg-success/20 text-success" : score >= 40 ? "bg-warning/20 text-warning" : "bg-muted text-muted-foreground",
            )}>
              {score}
            </span>
          )}
        </div>
        <div className="space-y-1 text-[11px] text-muted-foreground">
          {item.artistName && (
            <div className="text-gold/80 truncate">→ {item.artistName}</div>
          )}
          {(item.eventType || item.eventDate) && (
            <div className="flex items-center gap-1.5">
              <Calendar className="h-3 w-3" />
              {item.eventType ? eventTypeLabel(normalizeEventType(item.eventType)) : ""}
              {item.eventType && item.eventDate ? " · " : ""}
              {item.eventDate || ""}
            </div>
          )}
          {item.budget && (
            <div className="flex items-center gap-1.5">
              <DollarSign className="h-3 w-3" />
              {item.budget}€
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

function SortableItemCard({ item }: { item: CrmItem }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    data: { item },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <ItemCard item={item} />
    </div>
  );
}

interface KanbanBoardProps {
  items: CrmItem[];
  onItemsChange: (items: CrmItem[]) => void;
  loading: boolean;
}

export function KanbanBoard({ items, onItemsChange, loading }: KanbanBoardProps) {
  const { t } = useLocale();
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const overId = String(over.id);
    const targetColumn = allColumns.find((c) => c.id === overId);
    if (!targetColumn) return;

    const itemId = active.id as string;
    const currentItem = items.find((l) => l.id === itemId);
    if (!currentItem || currentItem.status === targetColumn.id) return;

    // Optimistic update
    onItemsChange(
      items.map((l) => (l.id === itemId ? { ...l, status: targetColumn.id } : l)),
    );

    // Persist via unified endpoint
    try {
      const res = await fetch("/api/crm/items", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: itemId, status: targetColumn.id }),
      });
      if (!res.ok) throw new Error();
      toast.success(`${currentItem.name} → ${t(targetColumn.labelKey)}`);
    } catch {
      // Revert on failure
      onItemsChange(
        items.map((l) => (l.id === itemId ? { ...l, status: currentItem.status } : l)),
      );
      toast.error(t("admin.kanban.statusError"));
    }
  }

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-gold" /></div>;
  }

  // Add extra columns for completed/lost/follow_up if items exist
  const extraStatuses = ["completed", "lost", "follow_up"];
  const extraColumns = extraStatuses
    .filter(s => items.some(l => l.status === s))
    .map(s => ({
      id: s,
      labelKey:
        s === "completed"
          ? "admin.kanban.stageCompleted"
          : s === "lost"
            ? "admin.kanban.stageLost"
            : "admin.kanban.stageFollowUp",
      color: s === "completed" ? "bg-success" : s === "lost" ? "bg-destructive" : "bg-warning",
    }));

  const allColumns = [...columns, ...extraColumns];

  const activeItem = items.find((l) => l.id === activeId);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4">
        {allColumns.map((col) => {
          const colItems = items.filter((l) => l.status === col.id);
          return (
            <div
              key={col.id}
              id={col.id}
              className="flex w-72 shrink-0 flex-col rounded-xl border border-border/40 bg-accent/20"
            >
              <div className="flex items-center gap-2 border-b border-border/40 p-3">
                <span className={cn("h-2.5 w-2.5 rounded-full", col.color)} />
                <span className="text-sm font-bold">{t(col.labelKey)}</span>
                <Badge variant="secondary" className="ml-auto text-xs">
                  {colItems.length}
                </Badge>
              </div>
              <SortableContext items={colItems.map((l) => l.id)} strategy={verticalListSortingStrategy}>
                <div className="flex flex-col gap-2 p-2 min-h-[200px]">
                  {colItems.map((item) => (
                    <SortableItemCard key={item.id} item={item} />
                  ))}
                  {colItems.length === 0 && (
                    <div className="flex h-20 items-center justify-center rounded-lg border border-dashed border-border/40 text-xs text-muted-foreground">
                      {t("admin.kanban.dropHere")}
                    </div>
                  )}
                </div>
              </SortableContext>
            </div>
          );
        })}
      </div>

      <DragOverlay>
        {activeItem ? (
          <div className="w-72 opacity-90">
            <ItemCard item={activeItem} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
