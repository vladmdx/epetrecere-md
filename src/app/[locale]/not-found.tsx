"use client";

import Link from "@/components/shared/locale-link";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/hooks/use-locale";

export default function NotFound() {
  const { t } = useLocale();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-center">
      <p className="font-accent text-6xl font-semibold text-gold">404</p>
      <h1 className="font-heading text-2xl font-bold">{t("notFound.title")}</h1>
      <p className="text-muted-foreground">{t("notFound.description")}</p>
      <Link href="/">
        <Button className="bg-gold text-[#0D0D0D] hover:bg-gold-dark">
          {t("notFound.backHome")}
        </Button>
      </Link>
    </div>
  );
}
