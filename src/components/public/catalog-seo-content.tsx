"use client";

import { useLocale } from "@/hooks/use-locale";
import { faqJsonLd, safeJsonLd } from "@/lib/seo/jsonld";

type Kind = "artists" | "venues";

const content = {
  ro: {
    artists: {
      title: "Cum alegi artiști pentru evenimente în Moldova în 2026",
      paragraphs: [
        <>Compară <strong>artiști pentru evenimente în Chișinău și Moldova</strong> după portofoliu, stil, experiență, recenzii și potrivirea cu publicul tău. Prețul este important, dar oferta trebuie să precizeze durata programului, echipamentul, transportul și orele suplimentare.</>,
        <>Pentru o nuntă, verifică repertoriul complet și felul în care artistul comunică cu prezentatorul, sala și echipa tehnică. Pentru un eveniment corporate, cere un program adaptat profilului invitaților și un plan tehnic clar.</>,
      ],
      faq: [
        { question: "Când trebuie rezervat un artist pentru nuntă?", answer: "Pentru datele populare din 2026, începe selecția cu 6 - 12 luni înainte. Artiștii solicitați pot avea calendarul ocupat mai devreme." },
        { question: "Ce trebuie să includă contractul?", answer: "Contractul trebuie să indice data, orele, durata programului, echipamentul, transportul, avansul, anularea și condițiile pentru ore suplimentare." },
        { question: "Cum compar ofertele artiștilor?", answer: "Compară aceeași durată și aceleași servicii, apoi verifică portofoliul recent, recenziile și cerințele tehnice." },
      ],
    },
    venues: {
      title: "Cum alegi o sală de nuntă în Chișinău și Moldova",
      paragraphs: [
        <>O <strong>sală de nuntă în Chișinău</strong> trebuie comparată după capacitatea confortabilă, meniul complet, acces, parcare, acustică și planul pentru vreme nefavorabilă. Verifică spațiul după instalarea scenei, ringului și decorului.</>,
        <>Cere o ofertă scrisă cu meniul, băuturile, taxa de servire, orele suplimentare și toate serviciile incluse. Pentru locații din afara orașului, adaugă transportul invitaților și furnizorilor la costul total.</>,
      ],
      faq: [
        { question: "Cu cât timp înainte se rezervă sala?", answer: "Pentru o sâmbătă din sezonul 2026, este prudent să începi cu 9 - 14 luni înainte." },
        { question: "Cum verific capacitatea reală?", answer: "Cere o schiță cu mesele, scena, ringul, candy barul și culoarele montate pentru numărul tău de invitați." },
        { question: "Ce costuri suplimentare trebuie verificate?", answer: "Verifică taxa de servire, meniul echipei, curățenia, orele suplimentare, băuturile externe și eventualele taxe de locație." },
      ],
    },
  },
  ru: {
    artists: {
      title: "Как выбрать артистов на событие в Молдове в 2026 году",
      paragraphs: [
        <>Сравнивайте <strong>артистов для событий в Кишиневе и Молдове</strong> по портфолио, стилю, опыту и отзывам. В предложении должны быть указаны длительность, оборудование, транспорт и дополнительные часы.</>,
        <>Для свадьбы проверьте полный репертуар и взаимодействие с ведущим и технической командой. Для корпоративного события попросите программу под вашу аудиторию.</>,
      ],
      faq: [
        { question: "Когда бронировать артиста на свадьбу?", answer: "Для популярных дат 2026 года начинайте за 6 - 12 месяцев." },
        { question: "Что должно быть в договоре?", answer: "Дата, время, длительность, оборудование, транспорт, аванс, отмена и дополнительные часы." },
        { question: "Как сравнивать предложения?", answer: "Сравнивайте одинаковую длительность и услуги, затем проверьте свежие работы и технические требования." },
      ],
    },
    venues: {
      title: "Как выбрать свадебный зал в Кишиневе и Молдове",
      paragraphs: [
        <><strong>Свадебный зал в Кишиневе</strong> стоит сравнивать по комфортной вместимости, полному меню, парковке, акустике и запасному плану погоды.</>,
        <>Запросите письменную смету с меню, напитками, сервисным сбором, дополнительными часами и включенными услугами.</>,
      ],
      faq: [
        { question: "Когда бронировать зал?", answer: "Для субботы в сезон 2026 года разумно начинать за 9 - 14 месяцев." },
        { question: "Как проверить вместимость?", answer: "Попросите схему со столами, сценой, танцполом и проходами." },
        { question: "Какие доплаты проверить?", answer: "Сервисный сбор, питание команды, уборку, дополнительные часы и свои напитки." },
      ],
    },
  },
  en: {
    artists: {
      title: "How to choose event artists in Moldova in 2026",
      paragraphs: [
        <>Compare <strong>event artists in Chișinău and Moldova</strong> by portfolio, style, experience and reviews. A quote should define performance length, equipment, travel and overtime.</>,
        <>For a wedding, review the full repertoire and coordination with the host and technical team. For a corporate event, request a program that fits the audience.</>,
      ],
      faq: [
        { question: "When should a wedding artist be booked?", answer: "For popular 2026 dates, start 6 - 12 months ahead." },
        { question: "What should the contract include?", answer: "Date, hours, duration, equipment, travel, deposit, cancellation and overtime." },
        { question: "How should offers be compared?", answer: "Compare the same duration and services, then review recent work and technical requirements." },
      ],
    },
    venues: {
      title: "How to choose a wedding venue in Chișinău and Moldova",
      paragraphs: [
        <>Compare a <strong>wedding venue in Chișinău</strong> by comfortable capacity, complete menu, access, parking, acoustics and weather backup.</>,
        <>Request a written quote covering menu, drinks, service charge, overtime and included services. Add guest and supplier transport for venues outside the city.</>,
      ],
      faq: [
        { question: "When should a venue be booked?", answer: "For an in-season Saturday in 2026, start 9 - 14 months ahead." },
        { question: "How can real capacity be checked?", answer: "Request a floor plan with tables, stage, dance floor and circulation." },
        { question: "Which extra costs should be checked?", answer: "Service charge, supplier meals, cleaning, overtime, outside drinks and venue fees." },
      ],
    },
  },
} as const;

export function CatalogSeoContent({ kind }: { kind: Kind }) {
  const { locale } = useLocale();
  const value = content[locale][kind];

  return (
    <section className="border-t border-white/8 bg-[#080b11]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(faqJsonLd([...value.faq])) }}
      />
      <div className="mx-auto grid max-w-[1180px] gap-10 px-4 py-12 lg:grid-cols-[1fr_.9fr] lg:px-8">
        <div>
          <h2 className="font-heading text-3xl font-semibold text-[#edcf87]">{value.title}</h2>
          <div className="mt-5 space-y-4 text-sm leading-7 text-white/62">
            {value.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
          </div>
        </div>
        <div className="space-y-2">
          {value.faq.map((item) => (
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
