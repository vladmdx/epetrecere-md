"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, User2, Music2 } from "lucide-react";

type WhoKey = "igor" | "client";

const PERSONAS: Record<WhoKey, { label: string; email: string; role: string; dest: string; icon: React.ReactNode }> = {
  igor: {
    label: "Igor Nedoseikin (Artist)",
    email: "igor.nedoseikin@epetrecere.md",
    role: "Artist — vede panoul de rezervări",
    dest: "/dashboard/rezervari",
    icon: <Music2 className="h-5 w-5" />,
  },
  client: {
    label: "Test Client (Client)",
    email: "client.test@epetrecere.md",
    role: "Client — vede rezervările sale",
    dest: "/cabinet",
    icon: <User2 className="h-5 w-5" />,
  },
};

export default function TestLoginPage() {
  const clerk = useClerk();
  const router = useRouter();
  const [busy, setBusy] = useState<WhoKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loginAs(who: WhoKey) {
    setBusy(who);
    setError(null);
    try {
      // 1. Get a dev sign-in token from our API
      const r = await fetch(`/api/dev/sign-in-token?user=${who}`);
      const { token, error: err } = await r.json();
      if (err || !token) throw new Error(err || "no token");

      // 2. Sign out any existing session (so we can switch personas freely)
      if (clerk.user) {
        await clerk.signOut();
      }

      // 3. Use the legacy `create({ strategy: 'ticket' })` + `setActive()` flow
      //    (reliable one-shot; bypasses OTP entirely for these dev-only users)
      type LegacySignIn = {
        client: {
          signIn: {
            create: (p: { strategy: "ticket"; ticket: string }) => Promise<{
              status: string;
              createdSessionId?: string;
            }>;
          };
        };
      };
      const legacy = clerk as unknown as LegacySignIn;
      const res = await legacy.client.signIn.create({
        strategy: "ticket",
        ticket: token,
      });
      if (res.status !== "complete" || !res.createdSessionId) {
        throw new Error("sign-in not complete: " + res.status);
      }
      await clerk.setActive({ session: res.createdSessionId });

      // 4. Redirect
      router.push(PERSONAS[who].dest);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setBusy(null);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-gold/30">
        <CardHeader>
          <CardTitle className="font-heading text-2xl">🧪 Test Login</CardTitle>
          <CardDescription>
            Autentificare rapidă pentru conturile de test. Fără email, fără OTP.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(Object.keys(PERSONAS) as WhoKey[]).map((who) => {
            const p = PERSONAS[who];
            return (
              <button
                key={who}
                type="button"
                disabled={busy !== null}
                onClick={() => loginAs(who)}
                className="flex w-full items-center gap-4 rounded-lg border border-border/40 bg-card p-4 text-left transition-all hover:border-gold/50 hover:bg-accent/30 disabled:opacity-50"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold/10 text-gold">
                  {busy === who ? <Loader2 className="h-5 w-5 animate-spin" /> : p.icon}
                </div>
                <div className="flex-1">
                  <p className="font-semibold">{p.label}</p>
                  <p className="text-xs text-muted-foreground">{p.email}</p>
                  <p className="text-xs text-muted-foreground">{p.role}</p>
                </div>
              </button>
            );
          })}

          {error && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
              {error}
            </p>
          )}

          <p className="pt-2 text-center text-xs text-muted-foreground">
            Gated by <code className="text-gold">NODE_ENV !== production</code>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
