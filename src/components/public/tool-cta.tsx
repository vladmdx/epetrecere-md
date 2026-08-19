"use client";

// CTA button for /utilitati/[tool] landing pages. Behavior:
//   - signed in → push them straight into the cabinet route
//   - signed out → stash the desired route in sessionStorage and bounce
//                  through /sign-in. /auth-redirect picks it up.
//
// Using sessionStorage instead of a query param because Clerk's
// forceRedirectUrl is configured to /auth-redirect and we don't want to
// fork the auth flow for every tool.

import Link from "@/components/shared/locale-link";
import { useUser } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { ArrowRight, LogIn } from "lucide-react";
import { useLocale } from "@/hooks/use-locale";

interface Props {
  /** Cabinet path the user should land on (e.g. "/cabinet/buget"). */
  cabinetPath: string;
  /** CTA label override. Defaults to "Începe acum" / "Continuă". */
  label?: string;
}

export function ToolCta({ cabinetPath, label }: Props) {
  const { isLoaded, isSignedIn } = useUser();
  const { locale, t } = useLocale();
  const defaults = {
    ro: { start: "Începe acum", next: "Continuă" },
    ru: { start: "Начать", next: "Продолжить" },
    en: { start: "Start now", next: "Continue" },
  }[locale];

  if (!isLoaded) {
    // Reserve space so the layout doesn't jump on hydration.
    return (
      <Button disabled className="bg-gold/40 text-[#0D0D0D]">
        {t("common.loading")}
      </Button>
    );
  }

  if (isSignedIn) {
    return (
      <Link href={cabinetPath}>
        <Button className="bg-gold text-[#0D0D0D] hover:bg-gold-dark gap-2">
          {label ?? defaults.next}
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
        {label ?? defaults.start}
      </Button>
    </Link>
  );
}
