"use client";

import { useState, useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface BookingRequest {
  id: number;
  artistId: number;
  clientName: string;
  eventDate: string;
  startTime: string | null;
  endTime: string | null;
  eventType: string | null;
  status: string;
  artistReply: string | null;
  createdAt: string;
}

const statusConfig: Record<string, { label: string; color: string }> = {
  pending: { label: "In așteptare", color: "text-warning border-warning/30" },
  accepted: { label: "Acceptat", color: "text-success border-success/30" },
  confirmed_by_client: { label: "Confirmat", color: "text-success border-success/30" },
  rejected: { label: "Refuzat", color: "text-destructive border-destructive/30" },
  cancelled: { label: "Anulat", color: "text-muted-foreground border-border/40" },
  completed: { label: "Finalizat", color: "text-gold border-gold/30" },
};

export default function ReservationsPage() {
  const { isSignedIn, user } = useUser();
  const [bookings, setBookings] = useState<BookingRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSignedIn || !user?.primaryEmailAddress?.emailAddress) return;
    const email = user.primaryEmailAddress.emailAddress;
    fetch(`/api/booking-requests?client_email=${encodeURIComponent(email)}`)
      .then(r => r.ok ? r.json() : [])
      .then(data => { if (Array.isArray(data)) setBookings(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isSignedIn, user]);

  async function confirmBooking(id: number) {
    const res = await fetch(`/api/booking-requests/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "client_confirm" }),
    });
    if (!res.ok) { toast.error("Eroare la confirmare."); return; }
    toast.success("Rezervare confirmată!");
    setBookings(prev => prev.map(b => b.id === id ? { ...b, status: "confirmed_by_client" } : b));
  }

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div>;
  }

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold mb-1">Rezervările Mele</h1>
      <p className="text-sm text-muted-foreground mb-6">{bookings.length} rezervări</p>

      {bookings.length === 0 ? (
        <p className="py-12 text-center text-muted-foreground">Nu ai rezervări încă.</p>
      ) : (
        <div className="space-y-3">
          {bookings.map(b => {
            const cfg = statusConfig[b.status] || statusConfig.pending;
            return (
              <Card key={b.id} className="transition-all hover:border-gold/30">
                <CardContent className="py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{b.eventType || "Eveniment"}</span>
                        <Badge variant="outline" className={cn("text-xs", cfg.color)}>{cfg.label}</Badge>
                      </div>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> {b.eventDate}</span>
                        {b.startTime && <span>{b.startTime} - {b.endTime}</span>}
                      </div>
                      {b.artistReply && (
                        <div className="mt-2 rounded-lg bg-accent/50 p-3 text-sm">
                          <span className="font-medium">Răspunsul artistului:</span> {b.artistReply}
                        </div>
                      )}
                    </div>
                    {b.status === "accepted" && (
                      <Button size="sm" onClick={() => confirmBooking(b.id)} className="bg-gold text-background hover:bg-gold-dark text-xs">
                        Confirmă
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
