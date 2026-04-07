import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, CalendarDays, TrendingUp, Music } from "lucide-react";

const stats = [
  { label: "Solicitări noi", value: "0", icon: TrendingUp, color: "text-gold" },
  { label: "Evenimente luna asta", value: "0", icon: CalendarDays, color: "text-info" },
  { label: "Revenue estimat", value: "0 €", icon: TrendingUp, color: "text-success" },
  { label: "Artiști activi", value: "0", icon: Music, color: "text-gold" },
];

export default function AdminDashboard() {
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
          <p className="text-sm text-muted-foreground">
            Nu există solicitări momentan. Solicitările noi vor apărea aici.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
