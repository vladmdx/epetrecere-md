"use client";

import Link from "next/link";
import { useLocale } from "@/hooks/use-locale";

export function FloatingCTA() {
  const { t } = useLocale();

  return (
    <div className="md:hidden fixed bottom-4 left-4 right-4 z-50">
      <Link
        href="/planifica"
        className="block w-full bg-gold text-background text-center py-3 rounded-xl font-semibold shadow-[0_4px_20px_rgba(201,168,76,0.3)] text-sm"
      >
        {t("nav.planner")}
      </Link>
    </div>
  );
}
