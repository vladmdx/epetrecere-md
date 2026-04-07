import type { Metadata } from "next";
import Link from "next/link";
import { generateMeta } from "@/lib/seo/generate-meta";
import {
  Mic, Disc3, Music, Guitar, Camera, Video, Palette, PartyPopper,
  Building2, Speaker, Star, Sparkles, Cake, Flame,
} from "lucide-react";

export const metadata: Metadata = generateMeta({
  title: "Servicii pentru Evenimente",
  description: "Toate serviciile disponibile pentru evenimentul tău: artiști, fotografi, videografi, decor, echipament și multe altele.",
  path: "/servicii",
});

const services = [
  { slug: "moderatori", name: "Moderatori / MC", icon: Mic, desc: "Profesioniști care conduc ceremonia și petrecerea cu stil." },
  { slug: "dj", name: "DJ", icon: Disc3, desc: "Muzică pentru orice gust și atmosferă." },
  { slug: "cantareti", name: "Cântăreți", icon: Music, desc: "Voci excepționale pentru momentele speciale." },
  { slug: "formatii", name: "Formații & Grupuri", icon: Guitar, desc: "Muzică live pentru o petrecere de neuitat." },
  { slug: "fotografi", name: "Fotografi", icon: Camera, desc: "Capturăm cele mai frumoase momente." },
  { slug: "videografi", name: "Videografi", icon: Video, desc: "Filmări profesionale pentru amintiri veșnice." },
  { slug: "decor", name: "Decor & Floristică", icon: Palette, desc: "Transformăm spațiul în vis." },
  { slug: "animatori", name: "Animatori", icon: PartyPopper, desc: "Distracție garantată pentru toate vârstele." },
  { slug: "sali", name: "Săli & Restaurante", icon: Building2, desc: "Locația perfectă pentru evenimentul tău." },
  { slug: "echipament", name: "Echipament Tehnic", icon: Speaker, desc: "Sunet, lumini și scenă profesionale." },
  { slug: "show-program", name: "Show Program", icon: Star, desc: "Spectacole de foc, circ și magie." },
  { slug: "alte-servicii", name: "Candy Bar & Tort", icon: Cake, desc: "Dulciuri și tort pentru orice eveniment." },
];

export default function ServicesPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 lg:px-8">
      <div className="mb-10 text-center">
        <p className="mb-2 text-sm font-medium uppercase tracking-[3px] text-gold">
          Ce oferim
        </p>
        <h1 className="font-heading text-3xl font-bold md:text-4xl">Servicii pentru Evenimente</h1>
        <p className="mt-2 text-muted-foreground">
          Tot ce ai nevoie pentru un eveniment perfect, într-un singur loc
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {services.map((s) => (
          <Link
            key={s.slug}
            href={`/categorie/${s.slug}`}
            className="group flex flex-col items-center gap-3 rounded-xl border border-border/40 bg-card p-6 text-center transition-all duration-300 hover:border-gold/30 hover:shadow-[0_4px_20px_rgba(201,168,76,0.15)] hover:-translate-y-1"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gold/10 text-gold transition-colors group-hover:bg-gold/20">
              <s.icon className="h-7 w-7" />
            </div>
            <h3 className="font-heading text-sm font-bold">{s.name}</h3>
            <p className="text-xs text-muted-foreground">{s.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
