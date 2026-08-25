// Shared placeholder for venue dashboard sub-pages that are coming in
// later phases. Each stub imports this and passes its own title/description.

import Link from "next/link";
import { Construction, ArrowLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function VenuePlaceholder({
  title,
  description,
  phase,
}: {
  title: string;
  description: string;
  phase: string;
}) {
  return (
    <div className="space-y-4">
      <Link
        href="/dashboard/sala"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-gold"
      >
        <ArrowLeft className="h-3 w-3" /> Înapoi la Panoul Meu
      </Link>
      <div>
        <h1 className="font-heading text-2xl font-bold">{title}</h1>
        <p className="text-muted-foreground">{description}</p>
      </div>
      <Card>
        <CardContent className="py-16 text-center">
          <Construction className="mx-auto mb-4 h-12 w-12 text-gold/50" />
          <h2 className="font-heading text-xl font-bold">În dezvoltare</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Această secțiune este parte din <strong>{phase}</strong> al
            planului de implementare al dashboardului pentru săli. Va fi
            disponibilă în curând.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
