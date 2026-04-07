"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Eye, EyeOff, CheckCircle, MessageSquare, Phone, Mail, Calendar, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface OfferRequest {
  id: number;
  artistId: number;
  artistName: string | null;
  clientName: string;
  clientPhone: string;
  clientEmail: string | null;
  eventType: string | null;
  eventDate: string | null;
  message: string | null;
  adminSeen: boolean;
  adminComment: string | null;
  status: string;
  createdAt: string;
}

export default function AdminOfferRequestsPage() {
  const [requests, setRequests] = useState<OfferRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "new" | "seen">("new");

  useEffect(() => {
    fetch("/api/offer-requests")
      .then(r => r.json())
      .then(data => { setRequests(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function markSeen(id: number) {
    await fetch(`/api/offer-requests/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminSeen: true, status: "seen" }),
    });
    setRequests(prev => prev.map(r => r.id === id ? { ...r, adminSeen: true, status: "seen" } : r));
    toast.success("Marcat ca văzut");
  }

  async function addComment(id: number, comment: string) {
    await fetch(`/api/offer-requests/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminComment: comment, status: "processed" }),
    });
    setRequests(prev => prev.map(r => r.id === id ? { ...r, adminComment: comment, status: "processed" } : r));
    toast.success("Comentariu salvat");
  }

  const filtered = requests.filter(r => {
    if (filter === "new") return !r.adminSeen;
    if (filter === "seen") return r.adminSeen;
    return true;
  });

  const newCount = requests.filter(r => !r.adminSeen).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Cereri de Oferte</h1>
        <p className="text-sm text-muted-foreground">
          {newCount > 0 ? `${newCount} cereri noi nesupravegheate` : "Toate cererile procesate"}
        </p>
      </div>

      <div className="flex gap-2">
        {(["new", "seen", "all"] as const).map(f => (
          <Button key={f} variant={filter === f ? "default" : "outline"} size="sm"
            className={filter === f ? "bg-gold text-background hover:bg-gold-dark" : ""}
            onClick={() => setFilter(f)}>
            {f === "new" ? `Noi (${newCount})` : f === "seen" ? "Văzute" : "Toate"}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-gold" /></div>
      ) : (
        <div className="space-y-3">
          {filtered.map(req => (
            <OfferCard key={req.id} request={req} onMarkSeen={markSeen} onComment={addComment} />
          ))}
          {filtered.length === 0 && <p className="py-8 text-center text-muted-foreground">Nu sunt cereri</p>}
        </div>
      )}
    </div>
  );
}

function OfferCard({ request, onMarkSeen, onComment }: { request: OfferRequest; onMarkSeen: (id: number) => void; onComment: (id: number, comment: string) => void }) {
  const [comment, setComment] = useState(request.adminComment || "");
  const [editing, setEditing] = useState(false);

  return (
    <Card className={cn(!request.adminSeen && "border-warning/30 bg-warning/5")}>
      <CardContent className="py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <span className="font-medium">{request.clientName}</span>
              {request.artistName && <Badge variant="secondary" className="text-xs">→ {request.artistName}</Badge>}
              <Badge variant="outline" className={cn("text-xs",
                request.status === "new" ? "text-warning border-warning/30" :
                request.status === "processed" ? "text-success border-success/30" :
                "text-info border-info/30"
              )}>
                {request.status === "new" ? "Nou" : request.status === "processed" ? "Procesat" : "Văzut"}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <a href={`tel:${request.clientPhone}`} className="flex items-center gap-1 hover:text-gold"><Phone className="h-3.5 w-3.5" /> {request.clientPhone}</a>
              {request.clientEmail && <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> {request.clientEmail}</span>}
              {request.eventDate && <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> {request.eventDate}</span>}
              {request.eventType && <span>{request.eventType}</span>}
            </div>
            {request.message && <p className="text-sm text-muted-foreground bg-accent/50 rounded-lg p-2">{request.message}</p>}
            {request.adminComment && !editing && (
              <p className="text-sm text-gold bg-gold/5 rounded-lg p-2 cursor-pointer" onClick={() => setEditing(true)}>
                💬 {request.adminComment}
              </p>
            )}
            {editing && (
              <div className="flex gap-2">
                <Input value={comment} onChange={e => setComment(e.target.value)} placeholder="Comentariu admin..." className="flex-1" />
                <Button size="sm" className="bg-gold text-background hover:bg-gold-dark" onClick={() => { onComment(request.id, comment); setEditing(false); }}>Salvează</Button>
              </div>
            )}
          </div>
          <div className="flex gap-2 shrink-0">
            {!request.adminSeen && (
              <Button size="sm" variant="outline" className="gap-1" onClick={() => onMarkSeen(request.id)}>
                <CheckCircle className="h-3.5 w-3.5 text-success" /> Bifează
              </Button>
            )}
            {!editing && !request.adminComment && (
              <Button size="sm" variant="outline" className="gap-1" onClick={() => setEditing(true)}>
                <MessageSquare className="h-3.5 w-3.5" /> Comentariu
              </Button>
            )}
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{new Date(request.createdAt).toLocaleString("ro-RO")}</p>
      </CardContent>
    </Card>
  );
}
