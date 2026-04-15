"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Search, Phone, Mail, Calendar, DollarSign, User, ChevronRight,
  Clock, AlertCircle, CheckCircle, XCircle, MessageSquare, LayoutGrid, List, Loader2, Download,
} from "lucide-react";

const KanbanBoard = dynamic(
  () => import("./kanban").then((m) => m.KanbanBoard),
  { ssr: false },
);
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const statusConfig: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  new: { label: "Nou", color: "bg-info/10 text-info border-info/30", icon: AlertCircle },
  contacted: { label: "Contactat", color: "bg-warning/10 text-warning border-warning/30", icon: Phone },
  proposal_sent: { label: "Propunere", color: "bg-gold/10 text-gold border-gold/30", icon: Mail },
  negotiation: { label: "Negociere", color: "bg-purple-500/10 text-purple-500 border-purple-500/30", icon: MessageSquare },
  confirmed: { label: "Confirmat", color: "bg-success/10 text-success border-success/30", icon: CheckCircle },
  completed: { label: "Finalizat", color: "bg-success/10 text-success border-success/30", icon: CheckCircle },
  lost: { label: "Pierdut", color: "bg-destructive/10 text-destructive border-destructive/30", icon: XCircle },
  follow_up: { label: "Follow-up", color: "bg-warning/10 text-warning border-warning/30", icon: Clock },
};

interface Lead {
  id: number;
  name: string;
  phone: string;
  email: string | null;
  eventType: string | null;
  eventDate: string | null;
  location: string | null;
  guestCount: number | null;
  budget: number | null;
  status: string;
  source: string | null;
  score: number | null;
  message: string | null;
  createdAt: string;
}

const eventTypeLabels: Record<string, string> = {
  wedding: "Nuntă", baptism: "Botez", cumpatrie: "Cumpătrie",
  corporate: "Corporate", birthday: "Aniversare", concert: "Concert",
  other: "Altele",
};

export default function CRMPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [view, setView] = useState<"list" | "kanban">("list");

  useEffect(() => {
    fetch("/api/leads")
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(data => { setLeads(Array.isArray(data) ? data : []); })
      .catch(() => toast.error("Nu s-au putut încărca solicitările"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = leads.filter((lead) => {
    if (statusFilter !== "all" && lead.status !== statusFilter) return false;
    if (search && !lead.name.toLowerCase().includes(search.toLowerCase()) &&
        !lead.phone.includes(search) &&
        !(lead.email?.toLowerCase().includes(search.toLowerCase()))) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">CRM — Solicitări</h1>
          <p className="text-sm text-muted-foreground">{leads.length} solicitări totale</p>
        </div>
        <div className="flex items-center gap-2">
          {/* AD-10: CSV Export */}
          <Button variant="outline" size="sm" className="gap-1.5 border-gold/30 text-gold hover:bg-gold/10" onClick={() => {
            const header = "Nume,Telefon,Email,Eveniment,Data,Locatie,Invitati,Buget,Status,Sursa,Creat\n";
            const rows = leads.map((l) =>
              [l.name, l.phone, l.email || "", l.eventType || "", l.eventDate || "", l.location || "", l.guestCount || "", l.budget || "", l.status, l.source || "", l.createdAt]
                .map(v => `"${String(v).replace(/"/g, '""')}"`)
                .join(",")
            ).join("\n");
            const blob = new Blob(["\uFEFF" + header + rows], { type: "text/csv;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a"); a.href = url; a.download = `crm-leads-${new Date().toISOString().split("T")[0]}.csv`; a.click();
            URL.revokeObjectURL(url);
            toast.success("CSV exportat");
          }}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        <div className="flex gap-1 rounded-lg border border-border/40 p-1">
          <Button variant={view === "kanban" ? "default" : "ghost"} size="sm" className={view === "kanban" ? "bg-gold text-background hover:bg-gold-dark" : ""} onClick={() => setView("kanban")}>
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button variant={view === "list" ? "default" : "ghost"} size="sm" className={view === "list" ? "bg-gold text-background hover:bg-gold-dark" : ""} onClick={() => setView("list")}>
            <List className="h-4 w-4" />
          </Button>
        </div>
        </div>
      </div>

      {view === "kanban" && <KanbanBoard />}

      {view === "list" && (<>
      {/* Status Filter Pills */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={statusFilter === "all" ? "default" : "outline"}
          size="sm"
          className={statusFilter === "all" ? "bg-gold text-background hover:bg-gold-dark" : ""}
          onClick={() => setStatusFilter("all")}
        >
          Toate ({leads.length})
        </Button>
        {Object.entries(statusConfig).map(([key, cfg]) => {
          const count = leads.filter((l) => l.status === key).length;
          if (!count) return null;
          return (
            <Button
              key={key}
              variant={statusFilter === key ? "default" : "outline"}
              size="sm"
              className={statusFilter === key ? "bg-gold text-background hover:bg-gold-dark" : ""}
              onClick={() => setStatusFilter(key)}
            >
              {cfg.label} ({count})
            </Button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Caută după nume, telefon, email..."
          className="pl-9"
        />
      </div>

      {/* Loading */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-gold" /></div>
      ) : (
      /* Leads Table */
      <div className="space-y-3">
        {filtered.map((lead) => {
          const cfg = statusConfig[lead.status] || statusConfig.new;
          const score = lead.score ?? 0;
          return (
            <Link key={lead.id} href={`/admin/crm/${lead.id}`}>
              <Card className="transition-all hover:border-gold/30 hover:shadow-sm cursor-pointer">
                <CardContent className="flex items-center gap-4 py-4">
                  {/* Score */}
                  <div className={cn(
                    "flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                    score >= 70 ? "bg-success/10 text-success" :
                    score >= 40 ? "bg-warning/10 text-warning" :
                    "bg-muted text-muted-foreground",
                  )}>
                    {score}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{lead.name}</span>
                      <Badge variant="outline" className={cn("text-xs", cfg.color)}>
                        {cfg.label}
                      </Badge>
                      {lead.eventType && (
                        <Badge variant="secondary" className="text-xs">
                          {eventTypeLabels[lead.eventType] || lead.eventType}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {lead.phone}</span>
                      {lead.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {lead.email}</span>}
                      {lead.eventDate && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {lead.eventDate}</span>}
                      {lead.guestCount && <span className="flex items-center gap-1"><User className="h-3 w-3" /> {lead.guestCount} invitați</span>}
                      {lead.budget && <span className="flex items-center gap-1"><DollarSign className="h-3 w-3" /> {lead.budget}€</span>}
                    </div>
                    {lead.message && (
                      <p className="mt-1 text-xs text-muted-foreground truncate max-w-lg">{lead.message}</p>
                    )}
                  </div>

                  <div className="text-xs text-muted-foreground shrink-0">
                    {new Date(lead.createdAt).toLocaleDateString("ro-RO")}
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </CardContent>
              </Card>
            </Link>
          );
        })}

        {filtered.length === 0 && (
          <div className="py-12 text-center text-muted-foreground">
            {leads.length === 0 ? "Nu sunt solicitări încă" : "Nu s-au găsit solicitări"}
          </div>
        )}
      </div>
      )}
      </>)}
    </div>
  );
}
