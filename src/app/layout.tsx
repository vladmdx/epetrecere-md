import type { Metadata } from "next";
import "@/lib/env"; // Validate env vars at startup
import { Playfair_Display, DM_Sans, Cormorant_Garamond } from "next/font/google";
import { ThemeProvider } from "@/components/shared/theme-provider";
import { LocaleProvider } from "@/hooks/use-locale";
import { PreferencesProvider } from "@/hooks/use-preferences";
import { ClerkProvider } from "@clerk/nextjs";
import { roRO } from "@clerk/localizations";
import { CookieConsent } from "@/components/shared/cookie-consent";
import { PwaManager } from "@/components/shared/pwa-manager";
import { ReferralCapture } from "@/components/shared/referral-capture";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "700"],
  display: "swap",
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "700"],
  display: "swap",
});

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin", "cyrillic"],
  weight: ["600"],
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
      className={`${playfair.variable} ${dmSans.variable} ${cormorant.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col overflow-x-hidden">
        <ClerkProvider
          signInUrl="/sign-in"
          signUpUrl="/sign-up"
          // Force every successful auth (sign-in or sign-up, OAuth or
          // password) through /auth-redirect — that's where the role
          // picker lives. Setting it on the provider (not just on the
          // SignIn/SignUp components) covers OAuth callbacks that come
          // back without a mounted React component.
          signInForceRedirectUrl="/auth-redirect"
          signUpForceRedirectUrl="/auth-redirect"
          signInFallbackRedirectUrl="/auth-redirect"
          signUpFallbackRedirectUrl="/auth-redirect"
          localization={roRO}
        ><ThemeProvider><LocaleProvider><PreferencesProvider>
          {children}
          <CookieConsent />
          <PwaManager />
          <ReferralCapture />
          <Toaster />
        </PreferencesProvider></LocaleProvider></ThemeProvider></ClerkProvider>
      </body>
    </html>
  );
}
