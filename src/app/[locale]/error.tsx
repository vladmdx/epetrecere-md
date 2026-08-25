"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import { useLocale } from "@/hooks/use-locale";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useLocale();

  useEffect(() => {
    // Forward to Sentry so we learn about these from real user sessions.
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background text-center px-4">
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
