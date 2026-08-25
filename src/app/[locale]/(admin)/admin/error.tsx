"use client";

import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import { useLocale } from "@/hooks/use-locale";

export default function AdminError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  const { t } = useLocale();
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <AlertTriangle className="h-10 w-10 text-warning" />
      <h2 className="font-heading text-xl font-bold">
        {t("admin.moduleError.title")}
      </h2>
      <p className="text-sm text-muted-foreground">{error.message}</p>
      <Button onClick={reset} variant="outline">
        {t("admin.moduleError.retry")}
      </Button>
    </div>
  );
}
