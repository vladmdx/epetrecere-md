"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[admin-error-boundary]", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <AlertTriangle className="h-12 w-12 text-destructive" />
      <h2 className="font-heading text-2xl font-bold">Eroare Admin</h2>
      <p className="max-w-md text-muted-foreground">
        A apărut o eroare în panoul de administrare. Încercați din nou.
      </p>
      <div className="flex gap-3">
        <Button onClick={reset} className="bg-gold text-background hover:bg-gold-dark">
          Încearcă din nou
        </Button>
        <Button variant="outline" onClick={() => (window.location.href = "/admin")}>
          Dashboard Admin
        </Button>
      </div>
    </div>
  );
}
