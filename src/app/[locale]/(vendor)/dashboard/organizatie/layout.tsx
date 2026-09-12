import { redirect } from "next/navigation";
import { DEFAULT_LOCALE, isLocale, localizePath } from "@/lib/i18n/routing";
import { salaUsesLegacyLayout } from "@/lib/partner/multi-hall-gate";

export default async function OrganizatieLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  if (salaUsesLegacyLayout()) {
    redirect(localizePath("/dashboard/sala", locale));
  }
  return children;
}
