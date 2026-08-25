"use client";

// Error boundary for the client cabinet (/cabinet/*) route group.
// A render-time error below this shell won't blow up the whole app or
// crash the sidebar nav — we show a recoverable state with reset.

import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { useLocale } from "@/hooks/use-locale";

export default function ClientCabinetError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useLocale();
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <AlertTriangle className="h-12 w-12 text-warning" />
      <div>
        <h2 className="font-heading text-xl font-bold">
          {t("cabinet.error.title")}
        </h2>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          {t("cabinet.error.body")}
        </p>
        {error.digest && (
          <p className="mt-2 text-[10px] font-mono text-muted-foreground/60">
            {t("cabinet.error.codeLabel")} {error.digest}
          </p>
        )}
      </div>
      <div className="flex gap-2">
        <Button
          onClick={reset}
          className="bg-gold text-[#0D0D0D] hover:bg-gold-dark"
        >
          {t("cabinet.error.retry")}
        </Button>
        <Link
          href="/cabinet"
          className="inline-flex items-center gap-2 rounded-lg border border-border/40 px-4 py-2 text-sm hover:bg-muted"
        >
          {t("cabinet.backToCabinet")}
        </Link>
      </div>
    </div>
  );
}
