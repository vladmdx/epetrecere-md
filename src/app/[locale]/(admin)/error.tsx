"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import { useLocale } from "@/hooks/use-locale";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useLocale();
  useEffect(() => {
    console.error("[admin-error-boundary]", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <AlertTriangle className="h-12 w-12 text-destructive" />
      <h2 className="font-heading text-2xl font-bold">{t("adminUi.error.title")}</h2>
      <p className="max-w-md text-muted-foreground">
        {t("adminUi.error.body")}
      </p>
      <div className="flex gap-3">
        <Button onClick={reset} className="bg-gold text-[#0D0D0D] hover:bg-gold-dark">
          {t("adminUi.error.retry")}
        </Button>
        <Button variant="outline" onClick={() => (window.location.href = "/admin")}>
          {t("adminUi.error.dashboard")}
        </Button>
      </div>
    </div>
  );
}
