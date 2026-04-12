import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, CalendarDays, TrendingUp, Music } from "lucide-react";
import { db } from "@/lib/db";
import { artists, bookingRequests, offerRequests, leads } from "@/lib/db/schema";
import { eq, gte, desc, count } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/admin";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function AdminDashboard() {
  const admin = await requireAdmin();
  if (!admin.ok) redirect("/sign-in");

  // Real stats from DB
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [activeArtistsResult] = await db
    .select({ value: count() })
    .from(artists)
    .where(eq(artists.isActive, true));

  const [newLeadsResult] = await db
    .select({ value: count() })
    .from(leads)
    .where(gte(leads.createdAt, monthStart));

  const [bookingsResult] = await db
    .select({ value: count() })
    .from(bookingRequests)
    .where(gte(bookingRequests.createdAt, monthStart));

  const recentRequests = await db
    .select({
      id: offerRequests.id,
      clientName: offerRequests.clientName,
      eventType: offerRequests.eventType,
      eventDate: offerRequests.eventDate,
      status: offerRequests.status,
      createdAt: offerRequests.createdAt,
    })
    .from(offerRequests)
    .orderBy(desc(offerRequests.createdAt))
    .limit(5);

  const stats = [
    { label: "Leads luna asta", value: String(newLeadsResult?.value ?? 0), icon: TrendingUp, color: "text-gold" },
    { label: "Rezervări luna asta", value: String(bookingsResult?.value ?? 0), icon: CalendarDays, color: "text-info" },
    { label: "Solicitări recente", value: String(recentRequests.length), icon: Users, color: "text-success" },
    { label: "Artiști activi", value: String(activeArtistsResult?.value ?? 0), icon: Music, color: "text-gold" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Bine ai venit în panoul de administrare ePetrecere.md
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.label}
              </CardTitle>
              <stat.icon className={`h-5 w-5 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ultimele Solicitări</CardTitle>
        </CardHeader>
        <CardContent>
          {recentRequests.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nu există solicitări momentan.
            </p>
          ) : (
            <div className="space-y-3">
              {recentRequests.map((req) => (
                <div key={req.id} className="flex items-center justify-between border-b border-border/40 pb-2 last:border-0">
                  <div>
                    <p className="text-sm font-medium">{req.clientName}</p>
                    <p className="text-xs text-muted-foreground">
                      {req.eventType || "Eveniment"} · {req.eventDate || "Dată nespecificată"}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    req.status === "new" ? "bg-gold/10 text-gold" :
                    req.status === "processed" ? "bg-success/10 text-success" :
                    "bg-muted text-muted-foreground"
                  }`}>
                    {req.status}
                  </span>
                </div>
              ))}
              <Link href="/admin/cereri-oferte" className="text-xs text-gold hover:underline">
                Vezi toate solicitările →
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
