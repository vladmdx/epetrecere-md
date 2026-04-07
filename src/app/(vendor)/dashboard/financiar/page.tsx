import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DollarSign, TrendingUp, Clock, CheckCircle } from "lucide-react";

const stats = [
  { label: "Venituri luna asta", value: "2,400€", icon: DollarSign, color: "text-gold" },
  { label: "Total 2026", value: "8,600€", icon: TrendingUp, color: "text-success" },
  { label: "Plăți în așteptare", value: "1,200€", icon: Clock, color: "text-warning" },
  { label: "Plăți confirmate", value: "7,400€", icon: CheckCircle, color: "text-success" },
];

const transactions = [
  { id: 1, event: "Nuntă Popescu", date: "2026-08-15", amount: 1200, status: "pending" },
  { id: 2, event: "Corporate TechCorp", date: "2026-05-10", amount: 800, status: "paid" },
  { id: 3, event: "Botez Rusu", date: "2026-06-20", amount: 600, status: "paid" },
  { id: 4, event: "Aniversare Moraru", date: "2026-03-01", amount: 500, status: "paid" },
];

const months = [
  { month: "Ian", revenue: 800 },
  { month: "Feb", revenue: 1200 },
  { month: "Mar", revenue: 1500 },
  { month: "Apr", revenue: 2400 },
];

export default function VendorFinancialPage() {
  const maxRevenue = Math.max(...months.map((m) => m.revenue));

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-bold">Financiar</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="flex items-center gap-3 pt-6">
              <stat.icon className={`h-8 w-8 ${stat.color}`} />
              <div>
                <p className="text-xl font-bold">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Revenue chart */}
        <Card>
          <CardHeader><CardTitle>Venituri pe Luni</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-end gap-3 h-40">
              {months.map((m) => (
                <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-xs font-medium text-gold">{m.revenue}€</span>
                  <div className="w-full rounded-t bg-gold/20 relative" style={{ height: `${(m.revenue / maxRevenue) * 100}%` }}>
                    <div className="absolute inset-x-0 bottom-0 rounded-t bg-gold" style={{ height: "60%" }} />
                  </div>
                  <span className="text-xs text-muted-foreground">{m.month}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Transactions */}
        <Card>
          <CardHeader><CardTitle>Tranzacții</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {transactions.map((t) => (
                <div key={t.id} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{t.event}</p>
                    <p className="text-xs text-muted-foreground">{t.date}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-accent font-semibold text-gold">{t.amount}€</p>
                    <Badge variant="outline" className={t.status === "paid" ? "text-success border-success/30 text-xs" : "text-warning border-warning/30 text-xs"}>
                      {t.status === "paid" ? "Plătit" : "În așteptare"}
                    </Badge>
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
