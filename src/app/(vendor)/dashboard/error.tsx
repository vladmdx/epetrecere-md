"use client";

import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <AlertTriangle className="h-12 w-12 text-warning" />
      <h2 className="font-heading text-2xl font-bold">A apărut o eroare</h2>
      <p className="max-w-md text-muted-foreground">
        Ne cerem scuze pentru inconveniență. Încercați din nou sau reveniți mai târziu.
      </p>
      <Button onClick={reset} className="bg-gold text-background hover:bg-gold-dark">
        Încearcă din nou
      </Button>
    </div>
  );
}
