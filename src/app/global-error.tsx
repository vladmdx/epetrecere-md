"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { useLocale } from "@/hooks/use-locale";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // global-error replaces the root layout, so it renders outside
  // LocaleProvider — `useLocale` falls back to the default locale here.
  const { t } = useLocale();

  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="ro">
      <body className="bg-[#08090d] text-[#faf8f2]">
        <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#c9a84c]/15 text-3xl text-[#c9a84c]">
            !
          </div>
          <h1 className="text-2xl font-bold">{t("publicError.title")}</h1>
          <p className="max-w-md text-[#b0b0c0]">
            {t("publicError.globalDescription")}
          </p>
          <button
            type="button"
            onClick={reset}
            className="rounded-xl bg-[#c9a84c] px-5 py-3 font-semibold text-[#0d0d0d] transition hover:bg-[#a08839]"
          >
            {t("publicError.retry")}
          </button>
        </main>
      </body>
    </html>
  );
}
