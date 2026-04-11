import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, Eye, Star, DollarSign, Building2 } from "lucide-react";

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
          Bine ai venit în panoul tău
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

      {/* M12 — Call-to-action for users who want to list a venue. The actual
          gating happens inside venue-onboarding (redirects if already a
          venue owner). */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-gold/10 p-2 text-gold">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <p className="font-heading font-bold">Ai o sală de evenimente?</p>
              <p className="text-sm text-muted-foreground">
                Publică-o pe ePetrecere.md și primește cereri de ofertă.
              </p>
            </div>
          </div>
          <Link
            href="/dashboard/venue-onboarding"
            className="inline-flex items-center gap-2 rounded-lg border border-gold/40 bg-gold/5 px-4 py-2 text-sm font-medium text-gold hover:bg-gold/10"
          >
            Înregistrează sala
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
