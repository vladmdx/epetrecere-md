"use client";

import { useLocale } from "@/hooks/use-locale";
import { faqJsonLd, safeJsonLd } from "@/lib/seo/jsonld";

type Kind = "artists" | "venues";

/** Three questions per catalogue; the copy itself lives in the dictionary. */
const FAQ_SLOTS = [1, 2, 3] as const;

export function CatalogSeoContent({ kind }: { kind: Kind }) {
  const { t } = useLocale();
  // The opening paragraph carries the keyword in <strong>, so it is stored as
  // three pieces rather than one sentence — the markup has to survive the move
  // into the dictionary, and some languages put the phrase first (RU venues
  // opens on it, so its "pre" piece is empty).
  const ns = `catalogSeo.${kind}`;
  const faq = FAQ_SLOTS.map((slot) => ({
    question: t(`${ns}.faq.q${slot}`),
    answer: t(`${ns}.faq.a${slot}`),
  }));

  return (
    <section className="border-t border-white/8 bg-[#080b11]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(faqJsonLd(faq)) }}
      />
      <div className="mx-auto grid max-w-[1180px] gap-10 px-4 py-12 lg:grid-cols-[1fr_.9fr] lg:px-8">
        <div>
          <h2 className="font-heading text-3xl font-semibold text-[#edcf87]">{t(`${ns}.title`)}</h2>
          <div className="mt-5 space-y-4 text-sm leading-7 text-white/62">
            <p>
              {t(`${ns}.p1Pre`)}
              <strong>{t(`${ns}.p1Strong`)}</strong>
              {t(`${ns}.p1Post`)}
            </p>
            <p>{t(`${ns}.p2`)}</p>
          </div>
        </div>
        <div className="space-y-2">
          {faq.map((item) => (
            <details key={item.question} className="group rounded-xl border border-white/8 bg-white/[.025] p-4">
              <summary className="cursor-pointer list-none pr-6 text-sm font-semibold text-white">{item.question}</summary>
              <p className="mt-3 text-xs leading-6 text-white/55">{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
