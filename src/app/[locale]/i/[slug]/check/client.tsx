"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, X, Heart } from "lucide-react";

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
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError("Link invalid — lipsește token-ul de check-in.");
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
          setError(err.error || "Eroare la check-in");
          return;
        }
        setResult(await res.json());
      } catch {
        setError("Eroare de conexiune. Încearcă din nou.");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#0D0D0D] via-[#1A1A2E] to-[#0D0D0D] p-4">
      <div className="w-full max-w-md rounded-3xl border border-gold/20 bg-card/90 p-8 text-center shadow-2xl backdrop-blur-md">
        {loading && (
          <>
            <Loader2 className="mx-auto h-12 w-12 animate-spin text-gold" />
            <p className="mt-4 text-muted-foreground">
              Se verifică check-in-ul…
            </p>
          </>
        )}

        {error && !loading && (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-500/15 text-red-400">
              <X className="h-8 w-8" />
            </div>
            <h1 className="mt-4 font-heading text-2xl font-bold">
              Check-in eșuat
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
            <p className="mt-4 text-xs text-muted-foreground/60">
              Dacă problema persistă, roagă gazda să te adauge manual pe
              lista de check-in.
            </p>
          </>
        )}

        {result && !loading && (
          <>
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
              <CheckCircle2 className="h-12 w-12" />
            </div>
            <h1 className="mt-5 font-heading text-3xl font-bold">
              Bun venit!
            </h1>
            <p className="mt-3 font-accent text-2xl italic text-gold">
              {result.guest.name}
            </p>
            {result.guest.plusOne && result.guest.plusOneName && (
              <p className="mt-1 text-sm text-muted-foreground">
                cu {result.guest.plusOneName}
              </p>
            )}

            <div className="mt-6 rounded-xl bg-muted/30 p-4">
              {result.alreadyCheckedIn ? (
                <p className="text-sm text-muted-foreground">
                  Ai fost deja marcat prezent la{" "}
                  <strong className="text-foreground">
                    {new Date(result.checkedInAt).toLocaleTimeString("ro-RO", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </strong>
                  . Distracție plăcută!
                </p>
              ) : (
                <p className="text-sm">
                  Check-in confirmat la{" "}
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
              <span>Petrecere frumoasă de la ePetrecere.md</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
