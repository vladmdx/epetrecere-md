import type { Metadata } from "next";
import Link from "@/components/shared/locale-link";
import { CookieSettingsButton } from "@/components/shared/cookie-consent";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/routing";
import { t } from "@/i18n";
import { generateMeta } from "@/lib/seo/generate-meta";

const copy = {
  ro: {
    home: "Acasă",
    title: "Politica Cookies",
    updated: "Ultima actualizare: 5 septembrie 2026",
    intro: "Un cookie este un fișier mic stocat pe dispozitiv. Platforma poate folosi și tehnologii similare, precum localStorage, pentru preferințe și funcții locale.",
    sections: [
      ["Necesare", "Autentificarea, securitatea, prevenirea abuzurilor și funcțiile de bază folosesc elemente strict necesare. Acestea nu pot fi oprite din banner deoarece site-ul nu ar funcționa corect."],
      ["Preferințe", "Cu acordul tău, memorăm limba, aspectul și alte setări pentru a păstra experiența aleasă între vizite."],
      ["Analytics", "Doar după acord, trimitem evenimente agregate despre vizualizări și interacțiuni. Trackingul public este blocat tehnic înainte de acord."],
      ["Marketing", "Doar după acord, putem păstra atribuirea unei campanii sau a unui cod de recomandare și putem activa conținut promoțional personalizat."],
      ["Durată și retragere", "Alegerea este versionată și păstrată cel mult 12 luni. O poți modifica sau retrage oricând din butonul de mai jos. Retragerea nu afectează legalitatea prelucrării realizate înainte de retragere."],
    ],
    contact: "Pentru întrebări despre confidențialitate:",
    registryTitle: "Registrul tehnologiilor active",
    registryIntro: "Registrul de mai jos descrie tehnologiile observate în implementarea curentă. Cele opționale rămân dezactivate până la acord.",
    headers: ["Tehnologie", "Furnizor", "Scop", "Durată", "Categorie"],
    registry: [
      ["__session și tokenuri Clerk", "Clerk", "Autentificare și protecția sesiunii", "Sesiune / conform sesiunii contului", "Necesar"],
      ["__cf_bm", "Cloudflare, pe domeniul Clerk", "Detectarea traficului automat și securitate", "aprox. 30 minute", "Necesar"],
      ["ep_consent", "EPETRECERE", "Dovada alegerilor din banner", "12 luni", "Necesar"],
      ["locale", "EPETRECERE", "Limba interfeței", "12 luni", "Preferință"],
      ["epetrecere-public-ai-chat, localStorage", "EPETRECERE", "Istoricul local al asistentului, numai pe dispozitiv", "Până la ștergerea din browser sau resetarea chatului", "Necesar funcției"],
      ["moments-device-*, localStorage", "EPETRECERE", "Limitarea încărcărilor și ștergerea propriilor fotografii", "Până la ștergerea din browser; datele serverului 180 zile", "Necesar funcției"],
      ["compare/recent/preferences, localStorage", "EPETRECERE", "Comparații, elemente recente și preferințe UI", "Până la ștergerea din browser", "Preferință"],
    ],
  },
  ru: {
    home: "Главная",
    title: "Политика cookies",
    updated: "Обновлено: 5 сентября 2026 года",
    intro: "Cookie это небольшой файл на устройстве. Платформа также может использовать похожие технологии, включая localStorage, для настроек и локальных функций.",
    sections: [
      ["Необходимые", "Вход, безопасность, защита от злоупотреблений и основные функции используют строго необходимые элементы. Их нельзя отключить в баннере."],
      ["Предпочтения", "С вашего согласия мы сохраняем язык, оформление и другие настройки между посещениями."],
      ["Аналитика", "Только после согласия отправляются сводные события о просмотрах и взаимодействиях. До согласия публичный tracking технически заблокирован."],
      ["Маркетинг", "Только после согласия может сохраняться источник кампании или реферальный код и включаться персонализированный промоконтент."],
      ["Срок и отзыв", "Выбор имеет версию и хранится не более 12 месяцев. Его можно изменить или отозвать кнопкой ниже."],
    ],
    contact: "Вопросы о конфиденциальности:",
    registryTitle: "Реестр активных технологий",
    registryIntro: "Ниже перечислены технологии, используемые в текущей реализации. Необязательные технологии отключены до получения согласия.",
    headers: ["Технология", "Поставщик", "Цель", "Срок", "Категория"],
    registry: [
      ["__session и токены Clerk", "Clerk", "Вход и защита сессии", "Сессия / срок сессии аккаунта", "Необходимые"],
      ["__cf_bm", "Cloudflare на домене Clerk", "Защита от автоматического трафика", "около 30 минут", "Необходимые"],
      ["ep_consent", "EPETRECERE", "Доказательство выбора в cookie-баннере", "12 месяцев", "Необходимые"],
      ["locale", "EPETRECERE", "Язык интерфейса", "12 месяцев", "Настройки"],
      ["epetrecere-public-ai-chat, localStorage", "EPETRECERE", "Локальная история помощника на устройстве", "До удаления в браузере или сброса чата", "Для функции"],
      ["moments-device-*, localStorage", "EPETRECERE", "Лимит загрузок и удаление своих фото", "До удаления в браузере; серверные данные 180 дней", "Для функции"],
      ["compare/recent/preferences, localStorage", "EPETRECERE", "Сравнения, недавние элементы и UI-настройки", "До удаления в браузере", "Настройки"],
    ],
  },
  en: {
    home: "Home",
    title: "Cookie Policy",
    updated: "Last updated: 5 September 2026",
    intro: "A cookie is a small file stored on a device. The platform may also use similar technologies, including localStorage, for preferences and local features.",
    sections: [
      ["Necessary", "Authentication, security, abuse prevention and core features use strictly necessary storage. It cannot be disabled in the banner because the site would not work correctly."],
      ["Preferences", "With your choice, we remember language, appearance and other settings between visits."],
      ["Analytics", "Only after consent do we send aggregated view and interaction events. Public tracking is technically blocked before consent."],
      ["Marketing", "Only after consent may we retain campaign attribution or a referral code and enable personalized promotional content."],
      ["Duration and withdrawal", "Your versioned choice is retained for no more than 12 months. You may change or withdraw it at any time using the button below."],
    ],
    contact: "For privacy questions:",
    registryTitle: "Active technology register",
    registryIntro: "The register below reflects technologies used by the current implementation. Optional technologies remain disabled until consent.",
    headers: ["Technology", "Provider", "Purpose", "Duration", "Category"],
    registry: [
      ["__session and Clerk tokens", "Clerk", "Authentication and session security", "Session / account-session lifetime", "Necessary"],
      ["__cf_bm", "Cloudflare on the Clerk domain", "Automated-traffic detection and security", "about 30 minutes", "Necessary"],
      ["ep_consent", "EPETRECERE", "Evidence of cookie-banner choices", "12 months", "Necessary"],
      ["locale", "EPETRECERE", "Interface language", "12 months", "Preference"],
      ["epetrecere-public-ai-chat, localStorage", "EPETRECERE", "Assistant history stored only on the device", "Until cleared in the browser or chat is reset", "Feature necessary"],
      ["moments-device-*, localStorage", "EPETRECERE", "Upload limits and deletion of the uploader's photos", "Until cleared in browser; server data 180 days", "Feature necessary"],
      ["compare/recent/preferences, localStorage", "EPETRECERE", "Comparisons, recent items and UI preferences", "Until cleared in browser", "Preference"],
    ],
  },
} as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
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

export default async function CookiesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
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
        <section>
          <h2 className="font-heading text-xl font-semibold text-foreground">{labels.registryTitle}</h2>
          <p className="mt-2">{labels.registryIntro}</p>
          <div className="mt-4 overflow-x-auto rounded-xl border border-border/60">
            <table className="min-w-[760px] w-full text-left text-xs">
              <thead className="bg-muted/60 text-foreground">
                <tr>{labels.headers.map((header) => <th key={header} className="px-3 py-2 font-semibold">{header}</th>)}</tr>
              </thead>
              <tbody>
                {labels.registry.map((row) => (
                  <tr key={row[0]} className="border-t border-border/40">
                    {row.map((cell, index) => <td key={`${row[0]}-${index}`} className="px-3 py-2 align-top">{cell}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
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
    
      <div className="mt-8 rounded-xl border border-gold/30 bg-gold/5 p-4 text-sm">
        <p className="font-semibold">{t("legal.packet.title", locale)}</p>
        <p className="mt-1 text-muted-foreground">
          {t("legal.packet.body", locale)}{" "}
          <Link href="/legal" className="text-gold hover:underline">{t("legal.docsTitle", locale)}</Link>.
        </p>
      </div>
    </div>
  );
}
