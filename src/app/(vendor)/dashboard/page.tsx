import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, Eye, Star, DollarSign } from "lucide-react";

const stats = [
  { label: "Rezervări noi", value: "0", icon: BookOpen, color: "text-gold" },
  { label: "Vizite profil", value: "0", icon: Eye, color: "text-info" },
  { label: "Rating mediu", value: "—", icon: Star, color: "text-warning" },
  { label: "Venituri luna", value: "0 €", icon: DollarSign, color: "text-success" },
];

export default function VendorDashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Panoul Meu</h1>
        <p className="text-sm text-muted-foreground">
          Bine ai venit în panoul tău de artist
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
    </div>
  );
}
