import type { Metadata } from "next";
import { generateMeta } from "@/lib/seo/generate-meta";
import { Sparkles, Users, Calendar, Shield } from "lucide-react";

export const metadata: Metadata = generateMeta({
  title: "Despre Noi",
  description: "Despre ePetrecere.md — platforma de servicii pentru evenimente din Republica Moldova.",
  path: "/despre",
});

const features = [
  { icon: Users, title: "500+ Artiști", desc: "Cea mai mare bază de artiști și furnizori de servicii pentru evenimente din Moldova." },
  { icon: Calendar, title: "Calendar Live", desc: "Verifică disponibilitatea artiștilor și sălilor în timp real." },
  { icon: Shield, title: "Verificați", desc: "Toți artiștii sunt verificați și evaluați de clienți reali." },
  { icon: Sparkles, title: "AI Powered", desc: "Asistent AI pentru planificarea evenimentului perfect." },
];

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 lg:px-8">
      <div className="mx-auto max-w-3xl text-center">
        <p className="mb-2 text-sm font-medium uppercase tracking-[3px] text-gold">
          Despre Noi
        </p>
        <h1 className="font-heading text-3xl font-bold md:text-4xl">
          Platforma Nr. 1 pentru Evenimente din Moldova
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          ePetrecere.md conectează organizatorii de evenimente cu cei mai buni artiști, săli și furnizori de servicii din Republica Moldova.
        </p>
      </div>

      <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {features.map((f) => (
          <div key={f.title} className="rounded-xl border border-border/40 bg-card p-6 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gold/10 text-gold">
              <f.icon className="h-7 w-7" />
            </div>
            <h3 className="font-heading text-base font-bold">{f.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
          </div>
        ))}
      </div>

      <div className="mt-16 rounded-xl bg-gradient-to-r from-gold/5 via-gold/10 to-gold/5 p-12 text-center">
        <h2 className="font-heading text-2xl font-bold">Misiunea Noastră</h2>
        <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
          Ne dorim să facem planificarea evenimentelor accesibilă, transparentă și plăcută. Prin tehnologie modernă și o selecție atentă de profesioniști, transformăm fiecare eveniment într-o experiență memorabilă.
        </p>
      </div>
    </div>
  );
}
