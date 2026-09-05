"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LockKeyhole, Loader2 } from "lucide-react";
import { useLocale } from "@/hooks/use-locale";

const COPY = {
  ro: { title: "Galerie privată", body: "Introdu codul de 6 cifre primit de la organizator.", label: "Cod de acces", button: "Deschide galeria", invalid: "Cod incorect. Verifică mesajul organizatorului." },
  ru: { title: "Частная галерея", body: "Введите 6-значный код, полученный от организатора.", label: "Код доступа", button: "Открыть галерею", invalid: "Неверный код. Проверьте сообщение организатора." },
  en: { title: "Private gallery", body: "Enter the 6-digit code shared by the organizer.", label: "Access code", button: "Open gallery", invalid: "Incorrect code. Check the organizer's message." },
} as const;

export function MomentsAccessGate({ slug }: { slug: string }) {
  const { locale } = useLocale();
  const router = useRouter();
  const copy = COPY[locale];
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(pin)) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/moments/${slug}/access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      setError(copy.invalid);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-[70vh] items-center justify-center px-4 py-12">
      <form onSubmit={unlock} className="w-full max-w-sm rounded-2xl border border-gold/30 bg-card p-6 text-center shadow-2xl">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gold/10 text-gold">
          <LockKeyhole className="h-6 w-6" />
        </span>
        <h1 className="mt-4 font-heading text-2xl font-bold">{copy.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{copy.body}</p>
        <label htmlFor="moments-pin" className="mt-6 block text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">{copy.label}</label>
        <input id="moments-pin" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" required className="mt-2 w-full rounded-xl border border-border/60 bg-background px-4 py-3 text-center text-2xl tracking-[0.45em] outline-none focus:border-gold" />
        {error ? <p role="alert" className="mt-3 text-xs text-destructive">{error}</p> : null}
        <button disabled={busy || pin.length !== 6} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-gold px-4 py-3 font-medium text-[#0D0D0D] disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{copy.button}
        </button>
      </form>
    </main>
  );
}
