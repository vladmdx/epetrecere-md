import type { Metadata } from "next";
import Link from "next/link";
import { CookieSettingsButton } from "@/components/shared/cookie-consent";
import { getServerLocale } from "@/lib/i18n/server-locale";
import { generateMeta } from "@/lib/seo/generate-meta";

const copy = {
  ro: {
    home: "Acasă",
    title: "Politica Cookies",
    updated: "Ultima actualizare: 31 iulie 2026",
    intro: "Un cookie este un fișier mic stocat pe dispozitiv. Platforma poate folosi și tehnologii similare, precum localStorage, pentru preferințe și funcții locale.",
    sections: [
      ["Necesare", "Autentificarea, securitatea, prevenirea abuzurilor și funcțiile de bază folosesc elemente strict necesare. Acestea nu pot fi oprite din banner deoarece site-ul nu ar funcționa corect."],
      ["Preferințe", "Cu acordul tău, memorăm limba, aspectul și alte setări pentru a păstra experiența aleasă între vizite."],
      ["Analytics", "Doar după acord, trimitem evenimente agregate despre vizualizări și interacțiuni. Trackingul public este blocat tehnic înainte de acord."],
      ["Marketing", "Doar după acord, putem păstra atribuirea unei campanii sau a unui cod de recomandare și putem activa conținut promoțional personalizat."],
      ["Durată și retragere", "Alegerea este versionată și păstrată cel mult 12 luni. O poți modifica sau retrage oricând din butonul de mai jos. Retragerea nu afectează legalitatea prelucrării realizate înainte de retragere."],
    ],
    contact: "Pentru întrebări despre confidențialitate:",
  },
  ru: {
    home: "Главная",
    title: "Политика cookies",
    updated: "Обновлено: 31 июля 2026",
    intro: "Cookie это небольшой файл на устройстве. Платформа также может использовать похожие технологии, включая localStorage, для настроек и локальных функций.",
    sections: [
      ["Необходимые", "Вход, безопасность, защита от злоупотреблений и основные функции используют строго необходимые элементы. Их нельзя отключить в баннере."],
      ["Предпочтения", "С вашего согласия мы сохраняем язык, оформление и другие настройки между посещениями."],
      ["Аналитика", "Только после согласия отправляются сводные события о просмотрах и взаимодействиях. До согласия публичный tracking технически заблокирован."],
      ["Маркетинг", "Только после согласия может сохраняться источник кампании или реферальный код и включаться персонализированный промоконтент."],
      ["Срок и отзыв", "Выбор имеет версию и хранится не более 12 месяцев. Его можно изменить или отозвать кнопкой ниже."],
    ],
    contact: "Вопросы о конфиденциальности:",
  },
  en: {
    home: "Home",
    title: "Cookie Policy",
    updated: "Last updated: 31 July 2026",
    intro: "A cookie is a small file stored on a device. The platform may also use similar technologies, including localStorage, for preferences and local features.",
    sections: [
      ["Necessary", "Authentication, security, abuse prevention and core features use strictly necessary storage. It cannot be disabled in the banner because the site would not work correctly."],
      ["Preferences", "With your choice, we remember language, appearance and other settings between visits."],
      ["Analytics", "Only after consent do we send aggregated view and interaction events. Public tracking is technically blocked before consent."],
      ["Marketing", "Only after consent may we retain campaign attribution or a referral code and enable personalized promotional content."],
      ["Duration and withdrawal", "Your versioned choice is retained for no more than 12 months. You may change or withdraw it at any time using the button below."],
    ],
    contact: "For privacy questions:",
  },
} as const;

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();
  const meta = {
    ro: {
      title: "Politica Cookies ePetrecere.md",
      description:
        "Află cum folosim cookie-uri și stocare locală, ce este strict necesar și cum îți poți schimba acordul pe ePetrecere.md.",
    },
    ru: {
      title: "Политика cookies ePetrecere.md",
      description:
        "Узнайте, как используются cookies и локальное хранилище, что строго необходимо и как изменить согласие.",
    },
    en: {
      title: "ePetrecere.md Cookie Policy",
      description:
        "Learn how cookies and local storage are used, what is strictly necessary and how to change your consent choices.",
    },
  }[locale];
  return generateMeta({ ...meta, path: "/cookies", locale });
}

export default async function CookiesPage() {
  const locale = await getServerLocale();
  const labels = copy[locale];

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 lg:px-8">
      <nav className="mb-4 text-xs text-muted-foreground">
        <Link href="/" className="hover:text-gold">{labels.home}</Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">{labels.title}</span>
      </nav>

      <h1 className="font-heading text-3xl font-bold md:text-4xl">{labels.title}</h1>
      <p className="mt-2 text-xs text-muted-foreground">{labels.updated}</p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-muted-foreground">
        <p>{labels.intro}</p>
        {labels.sections.map(([title, body]) => (
          <section key={title}>
            <h2 className="font-heading text-xl font-semibold text-foreground">{title}</h2>
            <p className="mt-2">{body}</p>
          </section>
        ))}
        <CookieSettingsButton />
        <section>
          <p>
            {labels.contact}{" "}
            <a href="mailto:privacy@epetrecere.md" className="text-gold underline">
              privacy@epetrecere.md
            </a>
          </p>
        </section>
      </div>
    </div>
  );
}
