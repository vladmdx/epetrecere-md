"use client";

// CTA button for /utilitati/[tool] landing pages. Behavior:
//   - signed in → push them straight into the cabinet route
//   - signed out → stash the desired route in sessionStorage and bounce
//                  through /sign-in. /auth-redirect picks it up.
//
// Using sessionStorage instead of a query param because Clerk's
// forceRedirectUrl is configured to /auth-redirect and we don't want to
// fork the auth flow for every tool.

import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { ArrowRight, LogIn } from "lucide-react";

interface Props {
  /** Cabinet path the user should land on (e.g. "/cabinet/buget"). */
  cabinetPath: string;
  /** CTA label override. Defaults to "Începe acum" / "Continuă". */
  label?: string;
}

export function ToolCta({ cabinetPath, label }: Props) {
  const { isLoaded, isSignedIn } = useUser();

  if (!isLoaded) {
    // Reserve space so the layout doesn't jump on hydration.
    return (
      <Button disabled className="bg-gold/40 text-[#0D0D0D]">
        Se încarcă...
      </Button>
    );
  }

  if (isSignedIn) {
    return (
      <Link href={cabinetPath}>
        <Button className="bg-gold text-[#0D0D0D] hover:bg-gold-dark gap-2">
          {label ?? "Continuă"}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </Link>
    );
  }

  return (
    <Link
      href="/sign-in"
      onClick={() => {
        try {
          sessionStorage.setItem("next-url", cabinetPath);
        } catch {
          /* ignore — user will just land on /cabinet */
        }
      }}
    >
      <Button className="bg-gold text-[#0D0D0D] hover:bg-gold-dark gap-2">
        <LogIn className="h-4 w-4" />
        {label ?? "Începe acum"}
      </Button>
    </Link>
  );
}
