"use client";

import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import { useLocale } from "@/hooks/use-locale";

export default function PublicError({
  error: _error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  const { t } = useLocale();
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <AlertTriangle className="h-12 w-12 text-warning" />
      <h2 className="font-heading text-2xl font-bold">{t("publicError.title")}</h2>
      <p className="max-w-md text-muted-foreground">
        {t("publicError.description")}
      </p>
      <Button onClick={reset} className="bg-gold text-[#0D0D0D] hover:bg-gold-dark">
        {t("publicError.retry")}
      </Button>
    </div>
  );
}
