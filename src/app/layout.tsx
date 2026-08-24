import type { Metadata } from "next";
import "@/lib/env"; // Validate env vars at startup
import { Cormorant_Garamond, Manrope } from "next/font/google";
import { ThemeProvider } from "@/components/shared/theme-provider";
import { LocaleProvider } from "@/hooks/use-locale";
import { headers } from "next/headers";
import {
  DEFAULT_LOCALE,
  LOCALE_HEADER,
  isLocale,
  ogLocaleFor,
  type AppLocale,
} from "@/lib/i18n/routing";
import { SITE_URL } from "@/lib/seo/generate-meta";
import { PreferencesProvider } from "@/hooks/use-preferences";
import { LocalizedClerkProvider } from "@/components/shared/localized-clerk-provider";
import { CookieConsent } from "@/components/shared/cookie-consent";
import { PwaManager } from "@/components/shared/pwa-manager";
import { ReferralCapture } from "@/components/shared/referral-capture";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin", "latin-ext", "cyrillic"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin", "latin-ext", "cyrillic"],
  weight: ["600", "700"],
  display: "swap",
});

/** Site-wide title and description, one entry per language. */
const SITE_COPY: Record<AppLocale, { title: string; description: string }> = {
  ro: {
    title: "ePetrecere.md — Marketplace pentru Evenimente",
    description:
      "Platformă de servicii pentru evenimente din Republica Moldova. Artiști, săli, fotografi, DJ și multe altele pentru nunta, botezul sau evenimentul tău.",
  },
  ru: {
    title: "ePetrecere.md — маркетплейс для мероприятий",
    description:
      "Платформа услуг для мероприятий в Республике Молдова. Артисты, залы, фотографы, диджеи и многое другое для вашей свадьбы, крестин или праздника.",
  },
  en: {
    title: "ePetrecere.md — Event Services Marketplace",
    description:
      "Event services platform for the Republic of Moldova. Artists, venues, photographers, DJs and more for your wedding, christening or celebration.",
  },
};

/**
 * Site-wide defaults, in the language of the current request.
 *
 * This used to be a static `export const metadata`, and a static export cannot
 * read headers — so every route that did not set its own title/description
 * inherited the Romanian ones, including the /ru and /en renders. It is now a
 * `generateMetadata`, which costs nothing extra: the layout below already
 * awaits `headers()`, so this tree was never statically rendered anyway.
 *
 * Deliberately no `alternates` here. Metadata is merged per segment, so a
 * canonical or hreflang set defined at the root would be inherited verbatim by
 * every page that does not define its own — declaring each of them a duplicate
 * of the homepage. Canonicals belong to the page, via generateMeta().
 */
export async function generateMetadata(): Promise<Metadata> {
  const h = await headers();
  const headerLocale = h.get(LOCALE_HEADER);
  const locale = isLocale(headerLocale) ? headerLocale : DEFAULT_LOCALE;
  const copy = SITE_COPY[locale];

  return {
    title: {
      default: copy.title,
      template: "%s | ePetrecere.md",
    },
    description: copy.description,
    metadataBase: new URL(SITE_URL),
    openGraph: {
      type: "website",
      locale: ogLocaleFor(locale),
      siteName: "ePetrecere.md",
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // The locale comes from the URL prefix (resolved in middleware), so the
  // server renders the right language on the FIRST paint instead of shipping
  // Romanian and swapping it client-side — which is what made RU/EN invisible
  // to crawlers and caused the flash of Romanian text.
  const h = await headers();
  const headerLocale = h.get(LOCALE_HEADER);
  const locale = isLocale(headerLocale) ? headerLocale : DEFAULT_LOCALE;

  return (
    <html
      lang={locale}
      className={`${manrope.variable} ${cormorant.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col overflow-x-hidden">
        <ThemeProvider><LocaleProvider initialLocale={locale}><LocalizedClerkProvider><PreferencesProvider>
          {children}
          <CookieConsent />
          <PwaManager />
          <ReferralCapture />
          <Toaster />
        </PreferencesProvider></LocalizedClerkProvider></LocaleProvider></ThemeProvider>
      </body>
    </html>
  );
}
