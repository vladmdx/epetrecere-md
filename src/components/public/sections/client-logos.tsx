"use client";

const partners = [
  { name: "Orange Moldova", logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c9/Orange_logo.svg/150px-Orange_logo.svg.png" },
  { name: "Moldtelecom", logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Moldtelecom_logo.svg/150px-Moldtelecom_logo.svg.png" },
  { name: "Vinăria Purcari", logo: "https://purcari.wine/wp-content/uploads/2023/01/purcari-logo.svg" },
  { name: "Château Vartely", logo: "https://vfrfranchise.com/img/brands/chateau_vartely.svg" },
  { name: "maib", logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/41/Maib_logo.svg/150px-Maib_logo.svg.png" },
  { name: "Premier Energy", logo: "https://premierenergy.md/wp-content/themes/flavor/img/logo.svg" },
  { name: "Kaufland Moldova", logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/44/Kaufland_201x_logo.svg/150px-Kaufland_201x_logo.svg.png" },
  { name: "Fidesco", logo: "https://fidesco.md/img/fidesco-logo.svg" },
];

export function ClientLogosSection() {
  return (
    <section className="py-16">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <p className="mb-10 text-center text-sm font-medium uppercase tracking-[3px] text-gold">
          Partenerii noștri
        </p>
        <div className="flex flex-wrap items-center justify-center gap-8 md:gap-12">
          {partners.map((partner) => (
            <div
              key={partner.name}
              className="flex h-16 w-36 items-center justify-center rounded-lg border border-border/20 bg-card/80 px-4 grayscale opacity-70 transition-all duration-300 hover:grayscale-0 hover:opacity-100 hover:border-gold/30 hover:shadow-[0_0_15px_rgba(201,168,76,0.1)]"
              title={partner.name}
            >
              <img
                src={partner.logo}
                alt={partner.name}
                className="max-h-10 max-w-full object-contain brightness-0 invert opacity-60 transition-all duration-300 group-hover:opacity-100"
                loading="lazy"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = "none";
                  target.parentElement!.innerHTML = `<span class="text-xs font-medium text-muted-foreground">${partner.name}</span>`;
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
