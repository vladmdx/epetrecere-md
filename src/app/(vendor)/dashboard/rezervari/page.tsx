"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, User, MapPin, CheckCircle, XCircle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

const statusConfig: Record<string, { label: string; color: string }> = {
  pending: { label: "În așteptare", color: "bg-warning/10 text-warning border-warning/30" },
  accepted: { label: "Acceptat", color: "bg-success/10 text-success border-success/30" },
  declined: { label: "Refuzat", color: "bg-destructive/10 text-destructive border-destructive/30" },
  confirmed: { label: "Confirmat", color: "bg-gold/10 text-gold border-gold/30" },
  completed: { label: "Finalizat", color: "bg-success/10 text-success border-success/30" },
};

const demoBookings = [
  { id: 1, eventType: "Nuntă", eventDate: "2026-08-15", clientName: "Maria Popescu", location: "Chișinău", guestCount: 200, priceAgreed: 1200, status: "pending", createdAt: "2026-04-05" },
  { id: 2, eventType: "Corporate", eventDate: "2026-05-10", clientName: "SC TechCorp SRL", location: "Chișinău", guestCount: 80, priceAgreed: 800, status: "accepted", createdAt: "2026-04-01" },
  { id: 3, eventType: "Botez", eventDate: "2026-06-20", clientName: "Ion Rusu", location: "Bălți", guestCount: 60, priceAgreed: 600, status: "confirmed", createdAt: "2026-03-28" },
  { id: 4, eventType: "Aniversare", eventDate: "2026-03-01", clientName: "Elena Moraru", location: "Chișinău", guestCount: 40, priceAgreed: 500, status: "completed", createdAt: "2026-02-15" },
];

export default function VendorBookingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Rezervări</h1>
        <p className="text-sm text-muted-foreground">{demoBookings.length} rezervări</p>
      </div>

      <div className="space-y-3">
        {demoBookings.map((booking) => {
          const cfg = statusConfig[booking.status] || statusConfig.pending;
          return (
            <Card key={booking.id} className="transition-all hover:border-gold/30">
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="font-heading font-bold">{booking.eventType}</span>
                      <Badge variant="outline" className={cn("text-xs", cfg.color)}>{cfg.label}</Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> {booking.eventDate}</span>
                      <span className="flex items-center gap-1"><User className="h-3.5 w-3.5" /> {booking.clientName}</span>
                      <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {booking.location}</span>
                      <span>{booking.guestCount} invitați</span>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="font-accent text-lg font-semibold text-gold">{booking.priceAgreed}€</p>
                    <p className="text-xs text-muted-foreground">{booking.createdAt}</p>
                  </div>
                </div>

                {booking.status === "pending" && (
                  <div className="mt-4 flex gap-2 border-t border-border/40 pt-3">
                    <Button size="sm" className="bg-success text-white hover:bg-success/90 gap-1">
                      <CheckCircle className="h-3.5 w-3.5" /> Accept
                    </Button>
                    <Button size="sm" variant="outline" className="text-destructive gap-1">
                      <XCircle className="h-3.5 w-3.5" /> Refuză
                    </Button>
                  </div>
                )}

                {booking.status === "accepted" && (
                  <div className="mt-4 flex gap-2 border-t border-border/40 pt-3">
                    <Button size="sm" className="bg-gold text-background hover:bg-gold-dark gap-1">
                      <CheckCircle className="h-3.5 w-3.5" /> Marchează Finalizat
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
