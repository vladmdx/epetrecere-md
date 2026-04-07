"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft, Phone, Mail, Calendar, MapPin, Users, DollarSign,
  MessageSquare, Clock, CheckCircle,
} from "lucide-react";
import Link from "next/link";

// Demo lead detail
const lead = {
  id: 1, name: "Maria Popescu", phone: "+373 69 123 456", email: "maria@mail.md",
  eventType: "Nuntă", eventDate: "2026-08-15", location: "Chișinău",
  guestCount: 200, budget: 5000, status: "new", source: "wizard", score: 75,
  message: "Căutăm artiști pentru nunta noastră. Avem nevoie de cântăreț, DJ și fotograf.",
  createdAt: "2026-04-05T10:30:00",
};

const timeline = [
  { type: "status_change", content: "Lead creat din Event Planner Wizard", time: "2026-04-05 10:30", icon: Clock },
  { type: "note", content: "Scor automat calculat: 75 (buget mare + nuntă + wizard)", time: "2026-04-05 10:30", icon: CheckCircle },
];

export default function LeadDetailPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin/crm">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="font-heading text-2xl font-bold">{lead.name}</h1>
            <Badge variant="outline" className="bg-info/10 text-info border-info/30">Nou</Badge>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-success/10 text-sm font-bold text-success">
              {lead.score}
            </div>
          </div>
          <p className="text-sm text-muted-foreground">Creat pe {lead.createdAt}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1"><Phone className="h-3.5 w-3.5" /> Sună</Button>
          <Button variant="outline" size="sm" className="gap-1"><Mail className="h-3.5 w-3.5" /> Email</Button>
          <Button size="sm" className="bg-gold text-background hover:bg-gold-dark">Schimbă Status</Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Details */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle>Detalii Eveniment</CardTitle></CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                <InfoRow icon={Calendar} label="Tip eveniment" value={lead.eventType} />
                <InfoRow icon={Calendar} label="Data" value={lead.eventDate} />
                <InfoRow icon={MapPin} label="Locație" value={lead.location} />
                <InfoRow icon={Users} label="Invitați" value={`${lead.guestCount}`} />
                <InfoRow icon={DollarSign} label="Buget" value={`${lead.budget}€`} />
                <InfoRow icon={MessageSquare} label="Sursa" value={lead.source} />
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
              <div className="space-y-4">
                {timeline.map((item, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent">
                      <item.icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm">{item.content}</p>
                      <p className="text-xs text-muted-foreground">{item.time}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6">
                <Textarea placeholder="Adaugă o notă..." rows={2} />
                <Button size="sm" className="mt-2 bg-gold text-background hover:bg-gold-dark">
                  Adaugă Notă
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Contact</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <a href={`tel:${lead.phone}`} className="flex items-center gap-2 text-sm hover:text-gold">
                <Phone className="h-4 w-4 text-gold" /> {lead.phone}
              </a>
              {lead.email && (
                <a href={`mailto:${lead.email}`} className="flex items-center gap-2 text-sm hover:text-gold">
                  <Mail className="h-4 w-4 text-gold" /> {lead.email}
                </a>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Acțiuni Rapide</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Button variant="outline" className="w-full justify-start gap-2" size="sm">
                <CheckCircle className="h-4 w-4 text-success" /> Marchează Contactat
              </Button>
              <Button variant="outline" className="w-full justify-start gap-2" size="sm">
                <Mail className="h-4 w-4 text-gold" /> Trimite Propunere
              </Button>
              <Button variant="outline" className="w-full justify-start gap-2 text-destructive" size="sm">
                Marchează Pierdut
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
