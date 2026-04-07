import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Users, Calendar, DollarSign, Eye, MessageSquare } from "lucide-react";

const stats = [
  { label: "Vizite luna asta", value: "2,847", change: "+12%", icon: Eye, color: "text-info" },
  { label: "Solicitări noi", value: "34", change: "+5%", icon: MessageSquare, color: "text-gold" },
  { label: "Artiști activi", value: "156", change: "+3", icon: Users, color: "text-success" },
  { label: "Evenimente luna asta", value: "8", change: "+2", icon: Calendar, color: "text-warning" },
  { label: "Revenue estimat", value: "12,500€", change: "+18%", icon: DollarSign, color: "text-gold" },
  { label: "Rata conversie", value: "4.2%", change: "+0.5%", icon: TrendingUp, color: "text-success" },
];

const topArtists = [
  { name: "Ion Suruceanu", bookings: 12, revenue: "12,000€" },
  { name: "Zdob și Zdub", bookings: 8, revenue: "16,000€" },
  { name: "Cleopatra Stratan", bookings: 6, revenue: "9,000€" },
  { name: "DJ Andrei", bookings: 15, revenue: "3,000€" },
  { name: "MC Vitalie", bookings: 10, revenue: "3,000€" },
];

function ExportButtons() {
  return (
    <div className="flex gap-2">
      <a href="/api/export?type=artists" download className="inline-flex items-center gap-1.5 rounded-md border border-border/40 bg-card px-3 py-1.5 text-xs font-medium hover:border-gold/30 hover:text-gold">📊 Export Artiști CSV</a>
      <a href="/api/export?type=leads" download className="inline-flex items-center gap-1.5 rounded-md border border-border/40 bg-card px-3 py-1.5 text-xs font-medium hover:border-gold/30 hover:text-gold">📋 Export Leads CSV</a>
      <a href="/api/export?type=bookings" download className="inline-flex items-center gap-1.5 rounded-md border border-border/40 bg-card px-3 py-1.5 text-xs font-medium hover:border-gold/30 hover:text-gold">📅 Export Booking CSV</a>
    </div>
  );
}

export default function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold">Analitice</h1>
        <ExportButtons />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="flex items-center gap-4 pt-6">
              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent ${stat.color}`}>
                <stat.icon className="h-6 w-6" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stat.value}</p>
                <div className="flex items-center gap-2">
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                  <span className="text-xs text-success">{stat.change}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Top Artiști per Rezervări</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {topArtists.map((a, i) => (
                <div key={a.name} className="flex items-center gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gold/10 text-xs font-bold text-gold">
                    {i + 1}
                  </span>
                  <span className="flex-1 text-sm font-medium">{a.name}</span>
                  <span className="text-xs text-muted-foreground">{a.bookings} rezervări</span>
                  <span className="text-sm font-accent font-semibold text-gold">{a.revenue}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Surse Trafic</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { source: "Google Search", pct: 45 },
                { source: "Social Media", pct: 25 },
                { source: "Direct", pct: 18 },
                { source: "Referral", pct: 12 },
              ].map((s) => (
                <div key={s.source} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>{s.source}</span>
                    <span className="text-muted-foreground">{s.pct}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-gold" style={{ width: `${s.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
