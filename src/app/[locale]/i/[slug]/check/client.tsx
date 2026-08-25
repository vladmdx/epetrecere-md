"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, X, Heart } from "lucide-react";
import { useLocale } from "@/hooks/use-locale";

interface Props {
  slug: string;
  token: string | null;
}

interface Result {
  guest: {
    id: number;
    name: string;
    plusOne: boolean;
    plusOneName: string | null;
  };
  alreadyCheckedIn: boolean;
  checkedInAt: string;
}

export function CheckInClient({ slug: _slug, token }: Props) {
  const { t } = useLocale();
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError(t("invite.check.missingToken"));
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const res = await fetch("/api/invitations/checkin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          setError(err.error || t("invite.check.failed"));
          return;
        }
        setResult(await res.json());
      } catch {
        setError(t("invite.check.connectionError"));
      } finally {
        setLoading(false);
      }
    })();
    // `t` is deliberately out of the dependency list: this effect POSTs the
    // check-in, and re-running it on a translator identity change would
    // register the guest twice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#0D0D0D] via-[#1A1A2E] to-[#0D0D0D] p-4">
      <div className="w-full max-w-md rounded-3xl border border-gold/20 bg-card/90 p-8 text-center shadow-2xl backdrop-blur-md">
        {loading && (
          <>
            <Loader2 className="mx-auto h-12 w-12 animate-spin text-gold" />
            <p className="mt-4 text-muted-foreground">
              {t("invite.check.verifying")}
            </p>
          </>
        )}

        {error && !loading && (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-500/15 text-red-400">
              <X className="h-8 w-8" />
            </div>
            <h1 className="mt-4 font-heading text-2xl font-bold">
              {t("invite.check.failedTitle")}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
            <p className="mt-4 text-xs text-muted-foreground/60">
              {t("invite.check.persistHint")}
            </p>
          </>
        )}

        {result && !loading && (
          <>
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
              <CheckCircle2 className="h-12 w-12" />
            </div>
            <h1 className="mt-5 font-heading text-3xl font-bold">
              {t("invite.check.welcome")}
            </h1>
            <p className="mt-3 font-accent text-2xl italic text-gold">
              {result.guest.name}
            </p>
            {result.guest.plusOne && result.guest.plusOneName && (
              <p className="mt-1 text-sm text-muted-foreground">
                {t("invite.check.withCompanion", {
                  name: result.guest.plusOneName,
                })}
              </p>
            )}

            <div className="mt-6 rounded-xl bg-muted/30 p-4">
              {result.alreadyCheckedIn ? (
                <p className="text-sm text-muted-foreground">
                  {t("invite.check.alreadyPresent")}{" "}
                  <strong className="text-foreground">
                    {new Date(result.checkedInAt).toLocaleTimeString("ro-RO", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </strong>
                  {t("invite.check.alreadyPresentSuffix")}
                </p>
              ) : (
                <p className="text-sm">
                  {t("invite.check.confirmedAt")}{" "}
                  <strong className="text-gold">
                    {new Date(result.checkedInAt).toLocaleTimeString("ro-RO", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </strong>
                </p>
              )}
            </div>

            <div className="mt-6 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <Heart className="h-3 w-3 text-gold" />
              <span>{t("invite.check.footer")}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
