import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/routing";
import { SignupConsentGate } from "./signup-consent-gate";

export default async function SignUpPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;

  return (
    // Clerk ships its own translations (LocalizedClerkProvider feeds it the
    // active locale), so the legacy DOM translator must keep its hands off
    // this subtree — rewriting Clerk's text phrase by phrase corrupts it.
    <div
      data-no-auto-translate
      className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#0D0D0D] px-4 py-8"
    >
      <SignupConsentGate locale={locale} />
    </div>
  );
}
