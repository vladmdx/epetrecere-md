"use client";

import Link from "next/link";
import { Sparkles, Send, Globe, Camera, Music2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Pentru clienți",
    links: [
      { label: "Caută locații", href: "/sali" },
      { label: "Caută artiști", href: "/artisti" },
      { label: "Caută servicii", href: "/servicii" },
      { label: "Tipuri de evenimente", href: "/planifica" },
      { label: "Blog & Sfaturi", href: "/blog" },
    ],
  },
  {
    title: "Pentru furnizori",
    links: [
      { label: "Înregistrează-te", href: "/sign-up" },
      { label: "Cum funcționează", href: "/#cum-functioneaza" },
      { label: "Abonament", href: "/pachete" },
      { label: "Resurse pentru furnizori", href: "/blog" },
      { label: "Promovează-te", href: "/contact" },
    ],
  },
  {
    title: "Companie & Suport",
    links: [
      { label: "Despre noi", href: "/despre" },
      { label: "Contact", href: "/contact" },
      { label: "Termeni și condiții", href: "/termeni" },
      { label: "Politica de confidențialitate", href: "/confidentialitate" },
      { label: "Întrebări frecvente", href: "/contact" },
    ],
  },
];

const SOCIALS = [
  { icon: Globe, href: "#", label: "Facebook" },
  { icon: Camera, href: "#", label: "Instagram" },
  { icon: Music2, href: "#", label: "TikTok" },
  { icon: Send, href: "#", label: "Telegram" },
];

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-gold/10 bg-[#0A0A0A]">
      <div className="mx-auto max-w-7xl px-4 py-14 lg:px-8">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-5">
          {/* Brand */}
          <div className="space-y-4 lg:col-span-1">
            <Link href="/" className="flex items-center gap-2 text-white">
              <Sparkles className="h-6 w-6 text-gold" />
              <span className="font-heading text-xl font-bold">
                e<span className="text-gold">Petrecere</span>.md
              </span>
            </Link>
            <p className="text-sm leading-relaxed text-[#9A9AAB]">
              Platforma completă pentru planificarea evenimentelor în Republica
              Moldova.
            </p>
            <div className="flex gap-3">
              {SOCIALS.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  aria-label={s.label}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-[#9A9AAB] transition-colors hover:border-gold/40 hover:text-gold"
                >
                  <s.icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-gold">
                {col.title}
              </h3>
              <ul className="space-y-2.5 text-sm">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link href={l.href} className="text-[#9A9AAB] transition-colors hover:text-gold">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Newsletter */}
          <div>
            <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-gold">
              Abonează-te la noutăți
            </h3>
            <p className="mb-3 text-sm leading-relaxed text-[#9A9AAB]">
              Primește inspirație și oferte exclusive pentru evenimentul tău.
            </p>
            <form className="flex gap-2" onSubmit={(e) => e.preventDefault()}>
              <Input
                type="email"
                placeholder="Email-ul tău"
                className="flex-1 border-white/10 bg-white/[0.04] text-white placeholder:text-white/40"
              />
              <Button className="shrink-0 bg-gold text-[#0D0D0D] hover:bg-gold-dark" aria-label="Abonează-te">
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </div>

        <div className="mt-12 border-t border-white/10 pt-6 text-center text-xs text-[#7A7A8A]">
          © {year} ePetrecere.md. Toate drepturile rezervate.
        </div>
      </div>
    </footer>
  );
}
