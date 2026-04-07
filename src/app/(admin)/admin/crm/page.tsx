"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Search, Filter, Phone, Mail, Calendar, DollarSign, User, ChevronRight,
  Clock, AlertCircle, CheckCircle, XCircle, MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";

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

// Demo data — in production this fetches from API
const demoLeads = [
  { id: 1, name: "Maria Popescu", phone: "+373 69 123 456", email: "maria@mail.md", eventType: "wedding", eventDate: "2026-08-15", location: "Chișinău", guestCount: 200, budget: 5000, status: "new", source: "wizard", score: 75, createdAt: "2026-04-05" },
  { id: 2, name: "Ion Rusu", phone: "+373 78 555 321", email: "ion@mail.md", eventType: "baptism", eventDate: "2026-06-20", location: "Bălți", guestCount: 80, budget: 2000, status: "contacted", source: "form", score: 45, createdAt: "2026-04-03" },
  { id: 3, name: "Alina Cojocaru", phone: "+373 60 888 999", email: null, eventType: "corporate", eventDate: "2026-05-10", location: "Chișinău", guestCount: 50, budget: 3000, status: "proposal_sent", source: "direct", score: 60, createdAt: "2026-04-01" },
];

const eventTypeLabels: Record<string, string> = {
  wedding: "Nuntă", baptism: "Botez", cumpatrie: "Cumpătrie",
  corporate: "Corporate", birthday: "Aniversare", concert: "Concert",
};

export default function CRMPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filtered = demoLeads.filter((lead) => {
    if (statusFilter !== "all" && lead.status !== statusFilter) return false;
    if (search && !lead.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">CRM — Solicitări</h1>
          <p className="text-sm text-muted-foreground">{demoLeads.length} solicitări totale</p>
        </div>
      </div>

      {/* Status Filter Pills */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={statusFilter === "all" ? "default" : "outline"}
          size="sm"
          className={statusFilter === "all" ? "bg-gold text-background hover:bg-gold-dark" : ""}
          onClick={() => setStatusFilter("all")}
        >
          Toate ({demoLeads.length})
        </Button>
        {Object.entries(statusConfig).map(([key, cfg]) => {
          const count = demoLeads.filter((l) => l.status === key).length;
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
          placeholder="Caută după nume..."
          className="pl-9"
        />
      </div>

      {/* Leads Table */}
      <div className="space-y-3">
        {filtered.map((lead) => {
          const cfg = statusConfig[lead.status] || statusConfig.new;
          return (
            <Link key={lead.id} href={`/admin/crm/${lead.id}`}>
              <Card className="transition-all hover:border-gold/30 hover:shadow-sm cursor-pointer">
                <CardContent className="flex items-center gap-4 py-4">
                  {/* Score */}
                  <div className={cn(
                    "flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                    lead.score >= 70 ? "bg-success/10 text-success" :
                    lead.score >= 40 ? "bg-warning/10 text-warning" :
                    "bg-muted text-muted-foreground",
                  )}>
                    {lead.score}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{lead.name}</span>
                      <Badge variant="outline" className={cn("text-xs", cfg.color)}>
                        {cfg.label}
                      </Badge>
                      <Badge variant="secondary" className="text-xs">
                        {eventTypeLabels[lead.eventType] || lead.eventType}
                      </Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {lead.phone}</span>
                      {lead.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {lead.email}</span>}
                      <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {lead.eventDate}</span>
                      <span className="flex items-center gap-1"><User className="h-3 w-3" /> {lead.guestCount} invitați</span>
                      <span className="flex items-center gap-1"><DollarSign className="h-3 w-3" /> {lead.budget}€</span>
                    </div>
                  </div>

                  <div className="text-xs text-muted-foreground shrink-0">{lead.createdAt}</div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </CardContent>
              </Card>
            </Link>
          );
        })}

        {filtered.length === 0 && (
          <div className="py-12 text-center text-muted-foreground">
            Nu s-au găsit solicitări
          </div>
        )}
      </div>
    </div>
  );
}
