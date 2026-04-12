"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Cookie } from "lucide-react";

export function CookieConsent() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Intentional sync-in-effect: show the banner only on first visit,
    // reading the existing choice from localStorage. Runs once after
    // hydration — no re-render loop because setShow(false) never fires
    // from here.
    const consent = localStorage.getItem("cookie-consent");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!consent) setShow(true);
  }, []);

  function accept() {
    localStorage.setItem("cookie-consent", "accepted");
    setShow(false);
  }

  function decline() {
    localStorage.setItem("cookie-consent", "declined");
    setShow(false);
  }

  if (!show) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/40 bg-card/95 backdrop-blur-sm p-4">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 sm:flex-row">
        <Cookie className="h-6 w-6 shrink-0 text-gold" />
        <p className="flex-1 text-sm text-muted-foreground">
          Folosim cookie-uri pentru a îmbunătăți experiența pe site.
          Citește <a href="/cookies" className="text-gold underline">Politica Cookie</a>.
        </p>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={decline}>Refuz</Button>
          <Button size="sm" className="bg-gold text-background hover:bg-gold-dark" onClick={accept}>Accept</Button>
        </div>
      </div>
    </div>
  );
}
