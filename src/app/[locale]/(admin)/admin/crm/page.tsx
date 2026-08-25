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
  Music, Ticket,
} from "lucide-react";

const KanbanBoard = dynamic(
  () => import("./kanban").then((m) => m.KanbanBoard),
  { ssr: false },
);
import type { CrmItem } from "./kanban";
import { cn } from "@/lib/utils";
import { normalizeEventType, eventTypeLabel } from "@/lib/events/normalize";
import { useLocale } from "@/hooks/use-locale";
import { toast } from "sonner";

const statusConfig: Record<string, { labelKey: string; color: string; icon: typeof Clock }> = {
  new: { labelKey: "adminUi.status.new", color: "bg-info/10 text-info border-info/30", icon: AlertCircle },
  contacted: { labelKey: "adminUi.status.contacted", color: "bg-warning/10 text-warning border-warning/30", icon: Phone },
  proposal_sent: { labelKey: "adminUi.status.proposalShort", color: "bg-gold/10 text-gold border-gold/30", icon: Mail },
  negotiation: { labelKey: "adminUi.status.negotiation", color: "bg-purple-500/10 text-purple-500 border-purple-500/30", icon: MessageSquare },
  accepted: { labelKey: "adminUi.status.accepted", color: "bg-success/10 text-success border-success/30", icon: CheckCircle },
  confirmed: { labelKey: "adminUi.status.confirmed", color: "bg-success/10 text-success border-success/30", icon: CheckCircle },
  completed: { labelKey: "adminUi.status.completed", color: "bg-success/10 text-success border-success/30", icon: CheckCircle },
  lost: { labelKey: "adminUi.status.lost", color: "bg-destructive/10 text-destructive border-destructive/30", icon: XCircle },
  follow_up: { labelKey: "adminUi.status.followUp", color: "bg-warning/10 text-warning border-warning/30", icon: Clock },
};

const typeConfig = {
  lead: { labelKey: "adminUi.crm.typeLead", pluralKey: "adminUi.crm.typeLeadPlural", color: "bg-blue-500/10 text-blue-400 border-blue-500/30", icon: User },
  booking: { labelKey: "adminUi.crm.typeBooking", pluralKey: "adminUi.crm.typeBookingPlural", color: "bg-purple-500/10 text-purple-400 border-purple-500/30", icon: Ticket },
  offer: { labelKey: "adminUi.crm.typeOffer", pluralKey: "adminUi.crm.typeOfferPlural", color: "bg-gold/10 text-gold border-gold/30", icon: Music },
} as const;

export default function CRMPage() {
  const { t } = useLocale();
  const [items, setItems] = useState<CrmItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "lead" | "booking" | "offer">("all");
  const [view, setView] = useState<"list" | "kanban">("list");

  useEffect(() => {
    fetch("/api/crm/items")
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(data => { setItems(Array.isArray(data) ? data : []); })
      .catch(() => toast.error(t("adminUi.crm.toastLoadError")))
      .finally(() => setLoading(false));
  }, []);

  const filtered = items.filter((item) => {
    if (statusFilter !== "all" && item.status !== statusFilter) return false;
    if (typeFilter !== "all" && item.type !== typeFilter) return false;
    if (search && !item.name.toLowerCase().includes(search.toLowerCase()) &&
        !item.phone.includes(search) &&
        !(item.email?.toLowerCase().includes(search.toLowerCase()))) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">{t("adminUi.crm.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("adminUi.crm.counts", {
              total: items.length,
              leads: items.filter(i => i.type === "lead").length,
              bookings: items.filter(i => i.type === "booking").length,
              offers: items.filter(i => i.type === "offer").length,
            })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5 border-gold/30 text-gold hover:bg-gold/10" onClick={() => {
            const header = "Tip,Nume,Telefon,Email,Eveniment,Data,Locatie,Invitati,Buget,Status,Sursa,Artist,Creat\n";
            const rows = items.map((l) =>
              [l.type, l.name, l.phone, l.email || "", l.eventType ? eventTypeLabel(normalizeEventType(l.eventType)) : "", l.eventDate || "", l.location || "", l.guestCount || "", l.budget || "", l.status, l.source || "", l.artistName || "", l.createdAt]
                .map(v => `"${String(v).replace(/"/g, '""')}"`)
                .join(",")
            ).join("\n");
            const blob = new Blob(["\uFEFF" + header + rows], { type: "text/csv;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a"); a.href = url; a.download = `crm-${new Date().toISOString().split("T")[0]}.csv`; a.click();
            URL.revokeObjectURL(url);
            toast.success(t("adminUi.crm.toastCsvExported"));
          }}>
            <Download className="h-4 w-4" /> {t("adminUi.crm.exportCsv")}
          </Button>
          <div className="flex gap-1 rounded-lg border border-border/40 p-1">
            <Button variant={view === "kanban" ? "default" : "ghost"} size="sm" className={view === "kanban" ? "bg-gold text-[#0D0D0D] hover:bg-gold-dark" : ""} onClick={() => setView("kanban")}>
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button variant={view === "list" ? "default" : "ghost"} size="sm" className={view === "list" ? "bg-gold text-[#0D0D0D] hover:bg-gold-dark" : ""} onClick={() => setView("list")}>
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {view === "kanban" && <KanbanBoard items={items} onItemsChange={setItems} loading={loading} />}

      {view === "list" && (<>
        {/* Type Filter */}
        <div className="flex flex-wrap gap-2">
          <Button
            variant={typeFilter === "all" ? "default" : "outline"}
            size="sm"
            className={typeFilter === "all" ? "bg-gold text-[#0D0D0D] hover:bg-gold-dark" : ""}
            onClick={() => setTypeFilter("all")}
          >
            {t("adminUi.crm.allTypes")} ({items.length})
          </Button>
          {(["lead", "booking", "offer"] as const).map((typeKey) => {
            const cfg = typeConfig[typeKey];
            const count = items.filter((i) => i.type === typeKey).length;
            return (
              <Button
                key={typeKey}
                variant={typeFilter === typeKey ? "default" : "outline"}
                size="sm"
                className={typeFilter === typeKey ? "bg-gold text-[#0D0D0D] hover:bg-gold-dark" : ""}
                onClick={() => setTypeFilter(typeKey)}
              >
                <cfg.icon className="h-3.5 w-3.5 mr-1" />
                {t(cfg.pluralKey)} ({count})
              </Button>
            );
          })}
        </div>

        {/* Status Filter Pills */}
        <div className="flex flex-wrap gap-2 border-t border-border/40 pt-3">
          <Button
            variant={statusFilter === "all" ? "default" : "outline"}
            size="sm"
            className={statusFilter === "all" ? "bg-gold text-[#0D0D0D] hover:bg-gold-dark" : ""}
            onClick={() => setStatusFilter("all")}
          >
            {t("adminUi.crm.allStatuses")}
          </Button>
          {Object.entries(statusConfig).map(([key, cfg]) => {
            const count = items.filter((l) => l.status === key && (typeFilter === "all" || l.type === typeFilter)).length;
            if (!count) return null;
            return (
              <Button
                key={key}
                variant={statusFilter === key ? "default" : "outline"}
                size="sm"
                className={statusFilter === key ? "bg-gold text-[#0D0D0D] hover:bg-gold-dark" : ""}
                onClick={() => setStatusFilter(key)}
              >
                {t(cfg.labelKey)} ({count})
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
            placeholder={t("adminUi.crm.searchPlaceholder")}
            className="pl-9"
          />
        </div>

        {/* Loading */}
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-gold" /></div>
        ) : (
          <div className="space-y-3">
            {filtered.map((item) => {
              const cfg = statusConfig[item.status] || statusConfig.new;
              const tcfg = typeConfig[item.type];
              const score = item.score ?? 0;
              const detailUrl =
                item.type === "lead" ? `/admin/crm/${item.rawId}` :
                item.type === "booking" ? `/admin/cereri-oferte` :
                "/admin/cereri-oferte";
              return (
                <Link key={item.id} href={detailUrl}>
                  <Card className="transition-all hover:border-gold/30 hover:shadow-sm cursor-pointer">
                    <CardContent className="flex items-center gap-4 py-4">
                      {/* Type icon */}
                      <div className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                        tcfg.color,
                      )}>
                        <tcfg.icon className="h-5 w-5" />
                      </div>

                      {/* Score (only for leads) */}
                      {item.type === "lead" && (
                        <div className={cn(
                          "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                          score >= 70 ? "bg-success/10 text-success" :
                          score >= 40 ? "bg-warning/10 text-warning" :
                          "bg-muted text-muted-foreground",
                        )}>
                          {score}
                        </div>
                      )}

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium truncate">{item.name}</span>
                          <Badge variant="outline" className={cn("text-xs", tcfg.color)}>
                            {t(tcfg.labelKey)}
                          </Badge>
                          <Badge variant="outline" className={cn("text-xs", cfg.color)}>
                            {t(cfg.labelKey)}
                          </Badge>
                          {item.eventType && (
                            <Badge variant="secondary" className="text-xs">
                              {eventTypeLabel(normalizeEventType(item.eventType))}
                            </Badge>
                          )}
                          {item.artistName && (
                            <Badge variant="secondary" className="text-xs">
                              → {item.artistName}
                            </Badge>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {item.phone}</span>
                          {item.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {item.email}</span>}
                          {item.eventDate && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {item.eventDate}</span>}
                          {item.guestCount && <span className="flex items-center gap-1"><User className="h-3 w-3" /> {item.guestCount} {t("common.guests")}</span>}
                          {item.budget && <span className="flex items-center gap-1"><DollarSign className="h-3 w-3" /> {item.budget}€</span>}
                        </div>
                        {item.message && (
                          <p className="mt-1 text-xs text-muted-foreground truncate max-w-lg">{item.message}</p>
                        )}
                      </div>

                      <div className="text-xs text-muted-foreground shrink-0">
                        {new Date(item.createdAt).toLocaleDateString("ro-RO")}
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    </CardContent>
                  </Card>
                </Link>
              );
            })}

            {filtered.length === 0 && (
              <div className="py-12 text-center text-muted-foreground">
                {items.length === 0 ? t("adminUi.crm.emptyNone") : t("adminUi.crm.emptyFiltered")}
              </div>
            )}
          </div>
        )}
      </>)}
    </div>
  );
}
