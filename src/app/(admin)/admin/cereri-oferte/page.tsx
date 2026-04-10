"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  CheckCircle, XCircle, MessageSquare, Phone, Mail, Calendar,
  Loader2, ArrowRight, Trash2, RotateCcw, Send,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface OfferRequest {
  id: number;
  artistId: number | null;
  artistName: string | null;
  venueId: number | null;
  venueName: string | null;
  clientName: string;
  clientPhone: string;
  clientEmail: string | null;
  eventType: string | null;
  eventDate: string | null;
  message: string | null;
  source: string | null;
  adminSeen: boolean;
  adminComment: string | null;
  status: string;
  createdAt: string;
}

type FilterTab = "new" | "accepted" | "rejected" | "all";

const eventTypeLabels: Record<string, string> = {
  wedding: "Nuntă", baptism: "Botez", cumpatrie: "Cumpătrie",
  corporate: "Corporate", birthday: "Aniversare", concert: "Concert",
  other: "Altele",
};

export default function AdminOfferRequestsPage() {
  const [requests, setRequests] = useState<OfferRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>("new");

  useEffect(() => {
    fetch("/api/offer-requests")
      .then(r => r.json())
      .then(data => { setRequests(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function updateStatus(id: number, status: string, extraFields?: Record<string, unknown>) {
    try {
      await fetch(`/api/offer-requests/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, adminSeen: true, ...extraFields }),
      });
      setRequests(prev => prev.map(r =>
        r.id === id ? { ...r, status, adminSeen: true, ...extraFields } : r
      ));
    } catch {
      toast.error("Eroare la actualizare");
    }
  }

  async function acceptRequest(id: number) {
    await updateStatus(id, "accepted");
    toast.success("Cerere acceptată");
  }

  async function rejectRequest(id: number) {
    await updateStatus(id, "rejected");
    toast.success("Cerere refuzată");
  }

  async function deleteRequest(id: number) {
    try {
      await fetch(`/api/offer-requests/${id}`, { method: "DELETE" });
      setRequests(prev => prev.filter(r => r.id !== id));
      toast.success("Cerere eliminată");
    } catch {
      toast.error("Eroare la ștergere");
    }
  }

  async function restoreRequest(id: number) {
    await updateStatus(id, "new", { adminSeen: false });
    toast.success("Cerere restaurată");
  }

  async function sendToCRM(id: number) {
    try {
      await fetch(`/api/offer-requests/${id}/to-crm`, { method: "POST" });
      await updateStatus(id, "in_crm");
      toast.success("Trimis în CRM");
    } catch {
      toast.error("Eroare la trimitere în CRM");
    }
  }

  async function addComment(id: number, comment: string) {
    await updateStatus(id, requests.find(r => r.id === id)?.status || "new", { adminComment: comment });
    toast.success("Comentariu salvat");
  }

  const counts = {
    new: requests.filter(r => r.status === "new").length,
    accepted: requests.filter(r => r.status === "accepted" || r.status === "in_crm").length,
    rejected: requests.filter(r => r.status === "rejected").length,
    all: requests.length,
  };

  const filtered = requests.filter(r => {
    if (filter === "new") return r.status === "new";
    if (filter === "accepted") return r.status === "accepted" || r.status === "in_crm";
    if (filter === "rejected") return r.status === "rejected";
    return true;
  });

  const tabs: { key: FilterTab; label: string; count: number }[] = [
    { key: "new", label: "Noi", count: counts.new },
    { key: "accepted", label: "Acceptate", count: counts.accepted },
    { key: "rejected", label: "Refuzate", count: counts.rejected },
    { key: "all", label: "Toate", count: counts.all },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Cereri de Oferte</h1>
        <p className="text-sm text-muted-foreground">
          {counts.new > 0 ? `${counts.new} cereri noi de procesat` : "Toate cererile procesate"}
        </p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {tabs.map(tab => (
          <Button
            key={tab.key}
            variant={filter === tab.key ? "default" : "outline"}
            size="sm"
            className={cn(
              filter === tab.key && "bg-gold text-background hover:bg-gold-dark",
              tab.key === "new" && tab.count > 0 && filter !== tab.key && "border-warning/50 text-warning",
            )}
            onClick={() => setFilter(tab.key)}
          >
            {tab.label} ({tab.count})
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-gold" /></div>
      ) : (
        <div className="space-y-3">
          {filtered.map(req => (
            <OfferCard
              key={req.id}
              request={req}
              onAccept={acceptRequest}
              onReject={rejectRequest}
              onDelete={deleteRequest}
              onRestore={restoreRequest}
              onSendToCRM={sendToCRM}
              onComment={addComment}
            />
          ))}
          {filtered.length === 0 && (
            <p className="py-8 text-center text-muted-foreground">
              {filter === "new" ? "Nu sunt cereri noi" :
               filter === "accepted" ? "Nu sunt cereri acceptate" :
               filter === "rejected" ? "Nu sunt cereri refuzate" :
               "Nu sunt cereri"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function OfferCard({
  request, onAccept, onReject, onDelete, onRestore, onSendToCRM, onComment,
}: {
  request: OfferRequest;
  onAccept: (id: number) => void;
  onReject: (id: number) => void;
  onDelete: (id: number) => void;
  onRestore: (id: number) => void;
  onSendToCRM: (id: number) => void;
  onComment: (id: number, comment: string) => void;
}) {
  const [comment, setComment] = useState(request.adminComment || "");
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const statusBadge = {
    new: { label: "Nou", className: "text-warning border-warning/30 bg-warning/10" },
    accepted: { label: "Acceptat", className: "text-success border-success/30 bg-success/10" },
    rejected: { label: "Refuzat", className: "text-destructive border-destructive/30 bg-destructive/10" },
    in_crm: { label: "În CRM", className: "text-info border-info/30 bg-info/10" },
    seen: { label: "Văzut", className: "text-info border-info/30 bg-info/10" },
    processed: { label: "Procesat", className: "text-success border-success/30 bg-success/10" },
  }[request.status] || { label: request.status, className: "" };

  return (
    <Card className={cn(
      "transition-all",
      request.status === "new" && "border-warning/30 bg-warning/5",
      request.status === "rejected" && "opacity-60",
    )}>
      <CardContent className="py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-2">
            {/* Header row */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-base">{request.clientName}</span>
              {request.artistName && (
                <Badge variant="secondary" className="text-xs">🎤 → {request.artistName}</Badge>
              )}
              {request.venueName && (
                <Badge variant="secondary" className="text-xs">🏛 → {request.venueName}</Badge>
              )}
              {!request.artistName && !request.venueName && (
                <Badge variant="secondary" className="text-xs">📋 Generală</Badge>
              )}
              <Badge variant="outline" className={cn("text-xs", statusBadge.className)}>
                {statusBadge.label}
              </Badge>
              {request.eventType && (
                <Badge variant="outline" className="text-xs">
                  {eventTypeLabels[request.eventType] || request.eventType}
                </Badge>
              )}
            </div>

            {/* Contact info */}
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <a href={`tel:${request.clientPhone}`} className="flex items-center gap-1 hover:text-gold transition-colors">
                <Phone className="h-3.5 w-3.5" /> {request.clientPhone}
              </a>
              {request.clientEmail && (
                <a href={`mailto:${request.clientEmail}`} className="flex items-center gap-1 hover:text-gold transition-colors">
                  <Mail className="h-3.5 w-3.5" /> {request.clientEmail}
                </a>
              )}
              {request.eventDate && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" /> {request.eventDate}
                </span>
              )}
            </div>

            {/* Message */}
            {request.message && (
              <p className="text-sm text-muted-foreground bg-accent/50 rounded-lg p-2.5">{request.message}</p>
            )}

            {/* Admin comment */}
            {request.adminComment && !editing && (
              <p className="text-sm text-gold bg-gold/5 rounded-lg p-2.5 cursor-pointer hover:bg-gold/10 transition-colors"
                onClick={() => setEditing(true)}>
                💬 {request.adminComment}
              </p>
            )}
            {editing && (
              <div className="flex gap-2">
                <Input value={comment} onChange={e => setComment(e.target.value)} placeholder="Comentariu admin..." className="flex-1" />
                <Button size="sm" className="bg-gold text-background hover:bg-gold-dark"
                  onClick={() => { onComment(request.id, comment); setEditing(false); }}>
                  Salvează
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Anulează</Button>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex flex-col gap-1.5 shrink-0">
            {/* New request actions */}
            {request.status === "new" && (
              <>
                <Button size="sm" className="gap-1.5 bg-success/90 hover:bg-success text-white" onClick={() => onAccept(request.id)}>
                  <CheckCircle className="h-3.5 w-3.5" /> Acceptă
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10" onClick={() => onReject(request.id)}>
                  <XCircle className="h-3.5 w-3.5" /> Refuză
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEditing(true)}>
                  <MessageSquare className="h-3.5 w-3.5" /> Notă
                </Button>
              </>
            )}

            {/* Accepted request actions */}
            {(request.status === "accepted") && (
              <>
                <Button size="sm" className="gap-1.5 bg-gold hover:bg-gold-dark text-background" onClick={() => onSendToCRM(request.id)}>
                  <Send className="h-3.5 w-3.5" /> Trimite în CRM
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEditing(true)}>
                  <MessageSquare className="h-3.5 w-3.5" /> Notă
                </Button>
              </>
            )}

            {/* In CRM */}
            {request.status === "in_crm" && (
              <Badge className="bg-info/10 text-info border-info/30 text-xs px-3 py-1.5">
                <ArrowRight className="h-3 w-3 mr-1" /> În CRM
              </Badge>
            )}

            {/* Rejected request actions */}
            {request.status === "rejected" && (
              <>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onRestore(request.id)}>
                  <RotateCcw className="h-3.5 w-3.5" /> Restaurează
                </Button>
                {!confirmDelete ? (
                  <Button size="sm" variant="outline" className="gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10"
                    onClick={() => setConfirmDelete(true)}>
                    <Trash2 className="h-3.5 w-3.5" /> Elimină
                  </Button>
                ) : (
                  <Button size="sm" className="gap-1.5 bg-destructive hover:bg-destructive/90 text-white"
                    onClick={() => onDelete(request.id)}>
                    <Trash2 className="h-3.5 w-3.5" /> Confirmi?
                  </Button>
                )}
              </>
            )}

            {/* Processed/seen — legacy statuses */}
            {(request.status === "seen" || request.status === "processed") && (
              <>
                <Button size="sm" className="gap-1.5 bg-success/90 hover:bg-success text-white" onClick={() => onAccept(request.id)}>
                  <CheckCircle className="h-3.5 w-3.5" /> Acceptă
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10" onClick={() => onReject(request.id)}>
                  <XCircle className="h-3.5 w-3.5" /> Refuză
                </Button>
              </>
            )}
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{new Date(request.createdAt).toLocaleString("ro-RO")}</p>
      </CardContent>
    </Card>
  );
}
