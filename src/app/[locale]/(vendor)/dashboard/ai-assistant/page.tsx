import { AIChat } from "@/components/shared/ai-chat";
import { t } from "@/i18n";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/routing";

export default async function VendorAIAssistantPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-heading text-2xl font-bold">{t("vendor.ai_assistant", locale)}</h1>
        <p className="text-sm text-muted-foreground">
          {t("vendor.aiAssistantPage.subtitle", locale)}
        </p>
      </div>
      <AIChat context="vendor" />
    </div>
  );
}
