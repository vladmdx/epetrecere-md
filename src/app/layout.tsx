import type { Metadata } from "next";
import "@/lib/env"; // Validate env vars at startup
import { Cormorant_Garamond, Manrope } from "next/font/google";
import { ThemeProvider } from "@/components/shared/theme-provider";
import { LocaleProvider } from "@/hooks/use-locale";
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

export const metadata: Metadata = {
  title: {
    default: "ePetrecere.md — Marketplace pentru Evenimente",
    template: "%s | ePetrecere.md",
  },
  description:
    "Platformă de servicii pentru evenimente din Republica Moldova. Artiști, săli, fotografi, DJ și multe altele pentru nunta, botezul sau evenimentul tău.",
  metadataBase: new URL("https://epetrecere.md"),
  openGraph: {
    type: "website",
    locale: "ro_MD",
    siteName: "ePetrecere.md",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ro"
      className={`${manrope.variable} ${cormorant.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col overflow-x-hidden">
        <ThemeProvider><LocaleProvider><LocalizedClerkProvider><PreferencesProvider>
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
