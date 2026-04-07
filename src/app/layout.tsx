import type { Metadata } from "next";
import { Playfair_Display, DM_Sans, Cormorant_Garamond } from "next/font/google";
import { ThemeProvider } from "@/components/shared/theme-provider";
import { CookieConsent } from "@/components/shared/cookie-consent";
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
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          {children}
          <CookieConsent />
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
