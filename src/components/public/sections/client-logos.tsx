"use client";

const partners = [
  { name: "Orange Moldova", logo: "/images/partners/orange.svg" },
  { name: "Moldtelecom", logo: "/images/partners/moldtelecom.svg" },
  { name: "Vinăria Purcari", logo: "/images/partners/purcari.svg" },
  { name: "Château Vartely", logo: "/images/partners/vartely.svg" },
  { name: "maib", logo: "/images/partners/maib.svg" },
  { name: "Premier Energy", logo: "/images/partners/premier-energy.svg" },
  { name: "Kaufland Moldova", logo: "/images/partners/kaufland.svg" },
  { name: "Starnet", logo: "/images/partners/starnet.svg" },
];

export function ClientLogosSection() {
  return (
    <section className="py-16">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <p className="mb-10 text-center text-sm font-medium uppercase tracking-[3px] text-gold">
          Partenerii noștri
        </p>
        <div className="flex flex-wrap items-center justify-center gap-6 md:gap-10">
          {partners.map((partner) => (
            <div
              key={partner.name}
              className="group flex h-16 w-48 items-center justify-center rounded-xl border border-white/8 bg-white/[0.04] px-5 transition-all duration-300 hover:border-gold/25 hover:bg-white/[0.08] hover:shadow-[0_0_20px_rgba(201,168,76,0.1)] hover:scale-105"
              title={partner.name}
            >
              <img
                src={partner.logo}
                alt={partner.name}
                className="max-h-11 max-w-[160px] w-full object-contain opacity-80 transition-all duration-300 group-hover:opacity-100"
                loading="lazy"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
