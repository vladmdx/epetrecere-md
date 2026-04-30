import Link from "next/link";
import { notFound } from "next/navigation";
import { generateMeta } from "@/lib/seo/generate-meta";
import { getPageMeta } from "@/lib/seo/page-meta";
import { ScrollReveal } from "@/components/shared/scroll-reveal";
import { ToolCta } from "@/components/public/tool-cta";
import { ToolHeroImage } from "@/components/public/tool-hero-image";
import { TOOLS_BY_SLUG, TOOL_DEFS } from "@/lib/utilitati/tools";
import { breadcrumbJsonLd, safeJsonLd } from "@/lib/seo/jsonld";
import { Check, ArrowRight } from "lucide-react";

export const revalidate = 3600;

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return TOOL_DEFS.map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const tool = TOOLS_BY_SLUG[slug];
  if (!tool) return {};
  const override = await getPageMeta(`/utilitati/${slug}`);
  return generateMeta({
    title: override?.title ?? tool.metaTitle,
    description: override?.description ?? tool.metaDescription,
    path: `/utilitati/${slug}`,
  });
}

export default async function ToolLandingPage({ params }: Props) {
  const { slug } = await params;
  const tool = TOOLS_BY_SLUG[slug];
  if (!tool) notFound();

  const breadcrumbs = [
    { name: "Acasă", url: "/" },
    { name: "Utilități", url: "/utilitati" },
    { name: tool.title, url: `/utilitati/${slug}` },
  ];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd(breadcrumbs)) }}
      />
      <main className="relative min-h-screen pt-24 pb-20">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <img
            src="/images/backgrounds/party-dance.jpg"
            alt=""
            className="parallax-bg h-full w-full object-cover opacity-[0.07] blur-[2px]"
            loading="lazy"
          />
        </div>

        <div className="relative z-10 mx-auto max-w-6xl px-4 lg:px-8">
          {/* Breadcrumbs */}
          <nav className="mb-6 text-xs text-muted-foreground">
            <Link href="/" className="hover:text-gold">Acasă</Link>
            <span className="mx-2">/</span>
            <Link href="/utilitati" className="hover:text-gold">Utilități</Link>
            <span className="mx-2">/</span>
            <span className="text-foreground">{tool.title}</span>
          </nav>

          {/* Hero */}
          <ScrollReveal>
            <div className="grid gap-10 lg:grid-cols-2 lg:gap-16 items-center mb-16">
              <div>
                <div className="inline-flex items-center gap-2 mb-4">
                  <span className="text-3xl">{tool.emoji}</span>
                  <p className="text-xs font-medium uppercase tracking-[3px] text-gold">
                    Instrument Gratuit
                  </p>
                </div>
                <h1 className="font-heading text-4xl font-bold md:text-5xl text-[#FAF8F2] mb-4">
                  {tool.title}
                </h1>
                <p className="text-base text-muted-foreground mb-6">
                  {tool.shortPitch}
                </p>

                {/* Features */}
                {tool.features.length > 0 && (
                  <ul className="space-y-2 mb-8">
                    {tool.features.map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <Check className="h-5 w-5 shrink-0 text-gold mt-0.5" />
                        <span className="text-foreground/90">{f}</span>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="flex flex-wrap items-center gap-3">
                  <ToolCta cabinetPath={tool.cabinetPath} />
                  <Link
                    href="/utilitati"
                    className="text-sm text-muted-foreground hover:text-gold inline-flex items-center gap-1"
                  >
                    Vezi alte instrumente
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
                <p className="mt-3 text-[11px] text-muted-foreground">
                  ✓ Gratuit · ✓ Nu necesită eveniment activat · ✓ Cont nou în 1 minut
                </p>
              </div>

              {/* Hero image / placeholder */}
              <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-gold/20 shadow-2xl">
                <ToolHeroImage
                  src={tool.placeholderImage}
                  alt={tool.imageAlt}
                  emoji={tool.emoji}
                />
              </div>
            </div>
          </ScrollReveal>

          {/* SEO body */}
          {tool.seoBody && (
            <ScrollReveal delay={0.1}>
              <section className="mt-12 border-t border-border/40 pt-10">
                <div className="prose prose-sm dark:prose-invert max-w-3xl mx-auto">
                  {tool.seoBody.split(/\n\s*\n/).map((para, idx) => {
                    const trimmed = para.trim();
                    if (!trimmed) return null;
                    if (trimmed.startsWith("## ")) {
                      return (
                        <h2
                          key={idx}
                          className="font-heading text-xl font-bold mt-6 mb-2 text-foreground"
                        >
                          {trimmed.slice(3)}
                        </h2>
                      );
                    }
                    if (trimmed.startsWith("### ")) {
                      return (
                        <h3
                          key={idx}
                          className="font-heading text-lg font-semibold mt-4 mb-1.5 text-foreground"
                        >
                          {trimmed.slice(4)}
                        </h3>
                      );
                    }
                    // Treat lines starting with "- " as a bullet list
                    if (trimmed.split("\n").every((line) => line.trimStart().startsWith("- "))) {
                      return (
                        <ul key={idx} className="mb-3 ml-4 list-disc space-y-1 text-muted-foreground">
                          {trimmed.split("\n").map((line, j) => (
                            <li key={j}>{line.trimStart().slice(2)}</li>
                          ))}
                        </ul>
                      );
                    }
                    return (
                      <p key={idx} className="mb-3 text-muted-foreground leading-relaxed">
                        {trimmed}
                      </p>
                    );
                  })}
                </div>
              </section>
            </ScrollReveal>
          )}

          {/* Bottom CTA */}
          <ScrollReveal delay={0.2}>
            <section className="mt-16 rounded-2xl border border-gold/30 bg-gold/5 p-8 md:p-12 text-center">
              <h2 className="font-heading text-2xl md:text-3xl font-bold mb-3">
                Începe acum — gratuit
              </h2>
              <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
                Creează-ți contul în 1 minut și folosește {tool.title.toLowerCase()} fără
                limită. Nu trebuie să ai un eveniment activ — instrumentul rulează independent.
              </p>
              <ToolCta cabinetPath={tool.cabinetPath} />
            </section>
          </ScrollReveal>
        </div>
      </main>
    </>
  );
}

