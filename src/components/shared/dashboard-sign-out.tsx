"use client";

import { useAuth, useClerk } from "@clerk/nextjs";
import { useRef, useState } from "react";
import { LogOut } from "lucide-react";
import { useLocale } from "@/hooks/use-locale";
import { localizePath } from "@/lib/i18n/routing";

export function DashboardSignOut() {
  const { signOut } = useClerk();
  const { isLoaded, sessionId } = useAuth();
  const { locale, t } = useLocale();
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function handleSignOut() {
    if (!isLoaded || !sessionId || inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setFailed(false);
    try {
      await signOut({ sessionId, redirectUrl: localizePath("/", locale) });
    } catch {
      setFailed(true);
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleSignOut}
        disabled={!isLoaded || !sessionId || pending}
        aria-busy={pending}
        className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      >
        <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{t("header.signOut")}</span>
      </button>
      {failed && (
        <p role="alert" className="px-3 py-1 text-sm text-destructive">
          {t("publicError.title")}. {t("publicError.retry")}.
        </p>
      )}
    </div>
  );
}
