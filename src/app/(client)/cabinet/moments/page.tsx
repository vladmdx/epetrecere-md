"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { Camera, Loader2, Plus } from "lucide-react";
import Link from "next/link";

export default function MomentsIndexPage() {
  const { isSignedIn, isLoaded } = useUser();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [noPlan, setNoPlan] = useState(false);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    fetch("/api/event-plans", { cache: "no-store" })
      .then(r => r.ok ? r.json() : { plans: [] })
      .then(data => {
        const plans = data.plans ?? [];
        if (plans.length > 0) {
          router.replace(`/cabinet/moments/${plans[0].id}`);
        } else {
          setNoPlan(true);
          setLoading(false);
        }
      })
      .catch(() => {
        setNoPlan(true);
        setLoading(false);
      });
  }, [isLoaded, isSignedIn, router]);

  if (loading && !noPlan) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <Camera className="mx-auto mb-4 h-12 w-12 text-gold/40" />
      <h1 className="font-heading text-xl font-bold">Momente Eveniment</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Pentru a activa galeria live cu QR code, creează mai întâi un plan de eveniment.
      </p>
      <Link
        href="/cabinet/planifica"
        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-gold px-4 py-2.5 text-sm font-medium text-background hover:bg-gold-dark"
      >
        <Plus className="h-4 w-4" /> Creează plan
      </Link>
    </div>
  );
}
