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
import { Phone, Calendar, DollarSign, User } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface Lead {
  id: number;
  name: string;
  phone: string;
  eventType: string;
  eventDate: string;
  budget: number;
  status: string;
  score: number;
  source: string;
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
  corporate: "Corporate", birthday: "Aniversare",
};

// Demo data
const demoLeads: Lead[] = [
  { id: 1, name: "Maria Popescu", phone: "+373 69 123", eventType: "wedding", eventDate: "2026-08-15", budget: 5000, status: "new", score: 75, source: "wizard" },
  { id: 2, name: "Ion Rusu", phone: "+373 78 555", eventType: "baptism", eventDate: "2026-06-20", budget: 2000, status: "new", score: 45, source: "form" },
  { id: 3, name: "Alina Cojocaru", phone: "+373 60 888", eventType: "corporate", eventDate: "2026-05-10", budget: 3000, status: "contacted", score: 60, source: "direct" },
  { id: 4, name: "Vasile Munteanu", phone: "+373 68 777", eventType: "wedding", eventDate: "2026-09-05", budget: 8000, status: "proposal_sent", score: 85, source: "wizard" },
  { id: 5, name: "Natalia Lupu", phone: "+373 79 444", eventType: "birthday", eventDate: "2026-07-12", budget: 1500, status: "negotiation", score: 50, source: "form" },
  { id: 6, name: "SC TechCorp", phone: "+373 22 100", eventType: "corporate", eventDate: "2026-05-25", budget: 4000, status: "confirmed", score: 70, source: "direct" },
];

function LeadCard({ lead }: { lead: Lead }) {
  return (
    <Link href={`/admin/crm/${lead.id}`}>
      <div className="rounded-lg border border-border/40 bg-card p-3 shadow-sm transition-all hover:border-gold/30 hover:shadow-md cursor-pointer">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium truncate">{lead.name}</span>
          <span className={cn(
            "flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold",
            lead.score >= 70 ? "bg-success/20 text-success" : lead.score >= 40 ? "bg-warning/20 text-warning" : "bg-muted text-muted-foreground",
          )}>
            {lead.score}
          </span>
        </div>
        <div className="space-y-1 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Calendar className="h-3 w-3" />
            {eventLabels[lead.eventType] || lead.eventType} · {lead.eventDate}
          </div>
          <div className="flex items-center gap-1.5">
            <DollarSign className="h-3 w-3" />
            {lead.budget}€
          </div>
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
  const [leadsList, setLeadsList] = useState(demoLeads);
  const [activeId, setActiveId] = useState<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as number);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const overId = String(over.id);
    // Check if dropped on a column
    const targetColumn = columns.find((c) => c.id === overId);
    if (targetColumn) {
      setLeadsList((prev) =>
        prev.map((l) => (l.id === active.id ? { ...l, status: targetColumn.id } : l)),
      );
    }
  }

  const activeLead = leadsList.find((l) => l.id === activeId);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map((col) => {
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
