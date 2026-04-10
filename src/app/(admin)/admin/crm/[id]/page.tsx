"use client";

import { useState, useEffect, use } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft, Phone, Mail, Calendar, MapPin, Users, DollarSign,
  MessageSquare, Clock, CheckCircle, XCircle, Loader2, Trash2,
  PhoneCall, Send, StickyNote, ChevronDown,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Lead {
  id: number;
  name: string;
  phone: string;
  phonePrefix: string | null;
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
  updatedAt: string | null;
  activities: Activity[];
}

interface Activity {
  id: number;
  leadId: number;
  type: string;
  content: string;
  createdAt: string;
}

const statusConfig: Record<string, { label: string; color: string }> = {
  new: { label: "Nou", color: "bg-info/10 text-info border-info/30" },
  contacted: { label: "Contactat", color: "bg-warning/10 text-warning border-warning/30" },
  proposal_sent: { label: "Propunere trimisă", color: "bg-gold/10 text-gold border-gold/30" },
  negotiation: { label: "Negociere", color: "bg-purple-500/10 text-purple-500 border-purple-500/30" },
  confirmed: { label: "Confirmat", color: "bg-success/10 text-success border-success/30" },
  completed: { label: "Finalizat", color: "bg-success/10 text-success border-success/30" },
  lost: { label: "Pierdut", color: "bg-destructive/10 text-destructive border-destructive/30" },
  follow_up: { label: "Follow-up", color: "bg-warning/10 text-warning border-warning/30" },
};

const eventTypeLabels: Record<string, string> = {
  wedding: "Nuntă", baptism: "Botez", cumpatrie: "Cumpătrie",
  corporate: "Corporate", birthday: "Aniversare", concert: "Concert",
  other: "Altele",
};

const activityIcons: Record<string, typeof Clock> = {
  status_change: Clock,
  note: StickyNote,
  call: PhoneCall,
  email: Send,
  sms: MessageSquare,
};

export default function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  useEffect(() => {
    fetch(`/api/leads/${id}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(data => { setLead(data); setLoading(false); })
      .catch(() => { setLoading(false); });
  }, [id]);

  async function updateStatus(newStatus: string) {
    if (!lead) return;
    setUpdatingStatus(true);
    try {
      const res = await fetch(`/api/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();

      // Refresh activities
      const actRes = await fetch(`/api/leads/${id}/activities`);
      const activities = await actRes.json();

      setLead({ ...updated, activities });
      setStatusOpen(false);
      toast.success(`Status schimbat: ${statusConfig[newStatus]?.label || newStatus}`);
    } catch {
      toast.error("Eroare la actualizare status");
    } finally {
      setUpdatingStatus(false);
    }
  }

  async function addNote(type: string = "note") {
    if (!note.trim()) return;
    setAddingNote(true);
    try {
      await fetch(`/api/leads/${id}/activities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, content: note }),
      });

      // Refresh activities
      const actRes = await fetch(`/api/leads/${id}/activities`);
      const activities = await actRes.json();

      setLead(prev => prev ? { ...prev, activities } : null);
      setNote("");
      toast.success("Notă adăugată");
    } catch {
      toast.error("Eroare la adăugare notă");
    } finally {
      setAddingNote(false);
    }
  }

  async function deleteLead() {
    if (!confirm("Sigur dorești să ștergi acest lead?")) return;
    try {
      await fetch(`/api/leads/${id}`, { method: "DELETE" });
      toast.success("Lead șters");
      router.push("/admin/crm");
    } catch {
      toast.error("Eroare la ștergere");
    }
  }

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-gold" /></div>;
  }

  if (!lead) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Lead-ul nu a fost găsit</p>
        <Link href="/admin/crm"><Button variant="outline" className="mt-4">Înapoi la CRM</Button></Link>
      </div>
    );
  }

  const score = lead.score ?? 0;
  const cfg = statusConfig[lead.status] || statusConfig.new;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/admin/crm">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="font-heading text-2xl font-bold">{lead.name}</h1>
            <Badge variant="outline" className={cn("text-xs", cfg.color)}>{cfg.label}</Badge>
            <div className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold",
              score >= 70 ? "bg-success/10 text-success" :
              score >= 40 ? "bg-warning/10 text-warning" :
              "bg-muted text-muted-foreground",
            )}>
              {score}
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Creat pe {new Date(lead.createdAt).toLocaleString("ro-RO")}
          </p>
        </div>
        <div className="flex gap-2">
          <a href={`tel:${lead.phone}`}>
            <Button variant="outline" size="sm" className="gap-1"><Phone className="h-3.5 w-3.5" /> Sună</Button>
          </a>
          {lead.email && (
            <a href={`mailto:${lead.email}`}>
              <Button variant="outline" size="sm" className="gap-1"><Mail className="h-3.5 w-3.5" /> Email</Button>
            </a>
          )}
          {/* Status dropdown */}
          <div className="relative">
            <Button size="sm" className="bg-gold text-background hover:bg-gold-dark gap-1"
              onClick={() => setStatusOpen(!statusOpen)} disabled={updatingStatus}>
              {updatingStatus ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronDown className="h-3.5 w-3.5" />}
              Schimbă Status
            </Button>
            {statusOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 w-56 rounded-lg border border-border bg-card shadow-lg py-1">
                {Object.entries(statusConfig).map(([key, val]) => (
                  <button key={key}
                    className={cn(
                      "w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center gap-2",
                      lead.status === key && "bg-accent font-medium"
                    )}
                    onClick={() => updateStatus(key)}
                    disabled={lead.status === key}
                  >
                    <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", val.color)}>{val.label}</Badge>
                    {lead.status === key && <span className="text-xs text-muted-foreground ml-auto">actual</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Event Details */}
          <Card>
            <CardHeader><CardTitle>Detalii Eveniment</CardTitle></CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                {lead.eventType && <InfoRow icon={Calendar} label="Tip eveniment" value={eventTypeLabels[lead.eventType] || lead.eventType} />}
                {lead.eventDate && <InfoRow icon={Calendar} label="Data" value={lead.eventDate} />}
                {lead.location && <InfoRow icon={MapPin} label="Locație" value={lead.location} />}
                {lead.guestCount && <InfoRow icon={Users} label="Invitați" value={`${lead.guestCount}`} />}
                {lead.budget && <InfoRow icon={DollarSign} label="Buget" value={`${lead.budget}€`} />}
                {lead.source && <InfoRow icon={MessageSquare} label="Sursa" value={lead.source} />}
              </div>
              {lead.message && (
                <div className="mt-4 rounded-lg bg-accent/50 p-4">
                  <p className="text-sm font-medium mb-1">Mesaj:</p>
                  <p className="text-sm text-muted-foreground">{lead.message}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Timeline */}
          <Card>
            <CardHeader><CardTitle>Activitate</CardTitle></CardHeader>
            <CardContent>
              {/* Add note */}
              <div className="mb-6">
                <Textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="Adaugă o notă, rezumat convorbire, etc..."
                  rows={2}
                />
                <div className="flex gap-2 mt-2">
                  <Button size="sm" className="bg-gold text-background hover:bg-gold-dark gap-1"
                    onClick={() => addNote("note")} disabled={addingNote || !note.trim()}>
                    {addingNote ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <StickyNote className="h-3.5 w-3.5" />}
                    Notă
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1"
                    onClick={() => addNote("call")} disabled={addingNote || !note.trim()}>
                    <PhoneCall className="h-3.5 w-3.5" /> Convorbire
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1"
                    onClick={() => addNote("email")} disabled={addingNote || !note.trim()}>
                    <Send className="h-3.5 w-3.5" /> Email trimis
                  </Button>
                </div>
              </div>

              {/* Activity list */}
              <div className="space-y-4">
                {lead.activities.length > 0 ? lead.activities.map(activity => {
                  const Icon = activityIcons[activity.type] || Clock;
                  return (
                    <div key={activity.id} className="flex gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm">{activity.content}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(activity.createdAt).toLocaleString("ro-RO")}
                        </p>
                      </div>
                    </div>
                  );
                }) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Nu există activitate încă. Adaugă o notă mai sus.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Contact card */}
          <Card>
            <CardHeader><CardTitle>Contact</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <a href={`tel:${lead.phone}`} className="flex items-center gap-2 text-sm hover:text-gold transition-colors">
                <Phone className="h-4 w-4 text-gold" /> {lead.phone}
              </a>
              {lead.email && (
                <a href={`mailto:${lead.email}`} className="flex items-center gap-2 text-sm hover:text-gold transition-colors">
                  <Mail className="h-4 w-4 text-gold" /> {lead.email}
                </a>
              )}
            </CardContent>
          </Card>

          {/* Quick actions */}
          <Card>
            <CardHeader><CardTitle>Acțiuni Rapide</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {lead.status === "new" && (
                <Button variant="outline" className="w-full justify-start gap-2" size="sm"
                  onClick={() => updateStatus("contacted")}>
                  <CheckCircle className="h-4 w-4 text-success" /> Marchează Contactat
                </Button>
              )}
              {lead.status === "contacted" && (
                <Button variant="outline" className="w-full justify-start gap-2" size="sm"
                  onClick={() => updateStatus("proposal_sent")}>
                  <Mail className="h-4 w-4 text-gold" /> Trimite Propunere
                </Button>
              )}
              {lead.status === "proposal_sent" && (
                <Button variant="outline" className="w-full justify-start gap-2" size="sm"
                  onClick={() => updateStatus("negotiation")}>
                  <MessageSquare className="h-4 w-4 text-purple-500" /> Începe Negociere
                </Button>
              )}
              {lead.status === "negotiation" && (
                <Button variant="outline" className="w-full justify-start gap-2" size="sm"
                  onClick={() => updateStatus("confirmed")}>
                  <CheckCircle className="h-4 w-4 text-success" /> Confirmă
                </Button>
              )}
              {lead.status === "confirmed" && (
                <Button variant="outline" className="w-full justify-start gap-2" size="sm"
                  onClick={() => updateStatus("completed")}>
                  <CheckCircle className="h-4 w-4 text-success" /> Marchează Finalizat
                </Button>
              )}
              {lead.status !== "follow_up" && lead.status !== "lost" && lead.status !== "completed" && (
                <Button variant="outline" className="w-full justify-start gap-2" size="sm"
                  onClick={() => updateStatus("follow_up")}>
                  <Clock className="h-4 w-4 text-warning" /> Follow-up
                </Button>
              )}
              {lead.status !== "lost" && lead.status !== "completed" && (
                <Button variant="outline" className="w-full justify-start gap-2 text-destructive hover:text-destructive" size="sm"
                  onClick={() => updateStatus("lost")}>
                  <XCircle className="h-4 w-4" /> Marchează Pierdut
                </Button>
              )}
              <hr className="border-border/40" />
              <Button variant="outline" className="w-full justify-start gap-2 text-destructive hover:text-destructive hover:bg-destructive/10" size="sm"
                onClick={deleteLead}>
                <Trash2 className="h-4 w-4" /> Șterge Lead
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: typeof Calendar; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      <span className="text-sm text-muted-foreground">{label}:</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}
