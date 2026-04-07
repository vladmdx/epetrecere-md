"use client";

const clients = [
  "TechCorp Moldova", "Grand Hotel", "Vinăria Purcari", "Orange Moldova",
  "Château Vartely", "Moldtelecom", "Zorile Store", "Premier Energy",
];

export function ClientLogosSection() {
  return (
    <section className="py-16">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <p className="mb-10 text-center text-sm font-medium uppercase tracking-[3px] text-gold">
          Partenerii noștri
        </p>
        <div className="flex flex-wrap items-center justify-center gap-8 md:gap-12">
          {clients.map((name) => (
            <div
              key={name}
              className="flex h-16 items-center rounded-lg border border-border/20 bg-card px-6 text-sm font-medium text-muted-foreground grayscale transition-all hover:text-gold hover:grayscale-0 hover:border-gold/20"
            >
              {name}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
