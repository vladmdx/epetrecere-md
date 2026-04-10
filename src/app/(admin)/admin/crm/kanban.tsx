"use client";

import { useState, useEffect } from "react";
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
import { Calendar, DollarSign, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { toast } from "sonner";

interface Lead {
  id: number;
  name: string;
  phone: string;
  eventType: string | null;
  eventDate: string | null;
  budget: number | null;
  status: string;
  score: number | null;
  source: string | null;
}

const columns = [
  { id: "new", label: "Noi", color: "bg-info" },
  { id: "contacted", label: "Contactați", color: "bg-warning" },
  { id: "proposal_sent", label: "Propunere", color: "bg-gold" },
  { id: "negotiation", label: "Negociere", color: "bg-purple-500" },
  { id: "confirmed", label: "Confirmați", color: "bg-success" },
];

const eventLabels: Record<string, string> = {
  wedding: "Nuntă", baptism: "Botez", cumpatrie: "Cumpătrie",
  corporate: "Corporate", birthday: "Aniversare", other: "Altele",
};

function LeadCard({ lead }: { lead: Lead }) {
  const score = lead.score ?? 0;
  return (
    <Link href={`/admin/crm/${lead.id}`}>
      <div className="rounded-lg border border-border/40 bg-card p-3 shadow-sm transition-all hover:border-gold/30 hover:shadow-md cursor-pointer">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium truncate">{lead.name}</span>
          <span className={cn(
            "flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold",
            score >= 70 ? "bg-success/20 text-success" : score >= 40 ? "bg-warning/20 text-warning" : "bg-muted text-muted-foreground",
          )}>
            {score}
          </span>
        </div>
        <div className="space-y-1 text-[11px] text-muted-foreground">
          {(lead.eventType || lead.eventDate) && (
            <div className="flex items-center gap-1.5">
              <Calendar className="h-3 w-3" />
              {lead.eventType ? (eventLabels[lead.eventType] || lead.eventType) : ""}
              {lead.eventType && lead.eventDate ? " · " : ""}
              {lead.eventDate || ""}
            </div>
          )}
          {lead.budget && (
            <div className="flex items-center gap-1.5">
              <DollarSign className="h-3 w-3" />
              {lead.budget}€
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

function SortableLeadCard({ lead }: { lead: Lead }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: lead.id,
    data: { lead },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <LeadCard lead={lead} />
    </div>
  );
}

export function KanbanBoard() {
  const [leadsList, setLeadsList] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  useEffect(() => {
    fetch("/api/leads")
      .then(r => r.json())
      .then(data => {
        setLeadsList(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as number);
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const overId = String(over.id);
    const targetColumn = columns.find((c) => c.id === overId);
    if (!targetColumn) return;

    const leadId = active.id as number;
    const currentLead = leadsList.find(l => l.id === leadId);
    if (!currentLead || currentLead.status === targetColumn.id) return;

    // Optimistic update
    setLeadsList((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, status: targetColumn.id } : l)),
    );

    // Persist to API
    try {
      await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: targetColumn.id }),
      });
      toast.success(`${currentLead.name} → ${targetColumn.label}`);
    } catch {
      // Revert on failure
      setLeadsList((prev) =>
        prev.map((l) => (l.id === leadId ? { ...l, status: currentLead.status } : l)),
      );
      toast.error("Eroare la actualizare status");
    }
  }

  const activeLead = leadsList.find((l) => l.id === activeId);

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-gold" /></div>;
  }

  // Include completed/lost/follow_up as extra columns if they have leads
  const extraStatuses = ["completed", "lost", "follow_up"];
  const extraColumns = extraStatuses
    .filter(s => leadsList.some(l => l.status === s))
    .map(s => ({
      id: s,
      label: s === "completed" ? "Finalizate" : s === "lost" ? "Pierdute" : "Follow-up",
      color: s === "completed" ? "bg-success" : s === "lost" ? "bg-destructive" : "bg-warning",
    }));

  const allColumns = [...columns, ...extraColumns];

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4">
        {allColumns.map((col) => {
          const colLeads = leadsList.filter((l) => l.status === col.id);
          return (
            <div
              key={col.id}
              id={col.id}
              className="flex w-72 shrink-0 flex-col rounded-xl border border-border/40 bg-accent/20"
            >
              <div className="flex items-center gap-2 border-b border-border/40 p-3">
                <span className={cn("h-2.5 w-2.5 rounded-full", col.color)} />
                <span className="text-sm font-bold">{col.label}</span>
                <Badge variant="secondary" className="ml-auto text-xs">
                  {colLeads.length}
                </Badge>
              </div>
              <SortableContext items={colLeads.map((l) => l.id)} strategy={verticalListSortingStrategy}>
                <div className="flex flex-col gap-2 p-2 min-h-[200px]">
                  {colLeads.map((lead) => (
                    <SortableLeadCard key={lead.id} lead={lead} />
                  ))}
                  {colLeads.length === 0 && (
                    <div className="flex h-20 items-center justify-center rounded-lg border border-dashed border-border/40 text-xs text-muted-foreground">
                      Trage aici
                    </div>
                  )}
                </div>
              </SortableContext>
            </div>
          );
        })}
      </div>

      <DragOverlay>
        {activeLead ? (
          <div className="w-72 opacity-90">
            <LeadCard lead={activeLead} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
