import type { Metadata } from "next";
import Link from "next/link";
import { generateMeta } from "@/lib/seo/generate-meta";
import { getServerLocale } from "@/lib/i18n/server-locale";

const copy = {
  ro: {
    home: "Acasă",
    title: "Politica de Confidențialitate",
    updated: "Ultima actualizare: 31 iulie 2026",
    metaTitle: "Confidențialitate și date personale ePetrecere.md",
    metaDescription:
      "Află cum ePetrecere.md colectează, folosește și protejează datele personale în Moldova și cum îți poți exercita drepturile.",
    sections: [
      {
        title: "1. Operator și domeniu de aplicare",
        body: "ePetrecere.md operează o platformă de servicii pentru evenimente în Republica Moldova. Politica se aplică vizitatorilor, clienților, artiștilor, partenerilor și reprezentanților sălilor. Pentru solicitări privind datele personale ne poți contacta la privacy@epetrecere.md.",
      },
      {
        title: "2. Cadrul legal aplicabil",
        body: "Până la 22 august 2026, prelucrarea este raportată la Legea nr. 133/2011. Din 23 august 2026 se aplică Legea nr. 195/2024 privind protecția datelor cu caracter personal, care transpune cadrul Regulamentului UE 2016/679. GDPR se poate aplica direct când platforma oferă servicii persoanelor vizate din Uniunea Europeană.",
      },
      {
        title: "3. Date și scopuri",
        body: "Putem prelucra date de cont și identitate, detalii despre eveniment, buget, invitați, cereri, rezervări, mesaje, recenzii, fișiere, fotografii și date tehnice de securitate. Datele de analytics și marketing sunt folosite numai când categoria opțională corespunzătoare a fost acceptată.",
      },
      {
        title: "4. Temeiuri",
        body: "Prelucrarea se bazează, după caz, pe executarea contractului sau pe pașii ceruți înainte de contract, obligația legală, interesul legitim pentru securitate și prevenirea abuzului ori consimțământul. Consimțământul poate fi retras fără a afecta prelucrarea realizată anterior.",
      },
      {
        title: "5. Destinatari și transferuri",
        body: "Datele nu sunt vândute. Ele sunt comunicate furnizorilor când inițiezi o cerere sau rezervare și procesatorilor necesari pentru autentificare, baze de date, stocare, email și funcții AI. Pentru prelucrarea în afara Republicii Moldova folosim mecanisme contractuale și măsuri de protecție adecvate situației.",
      },
      {
        title: "6. Păstrare și ștergere",
        body: "Datele active sunt păstrate cât timp contul sau evenimentul necesită serviciul. La ștergerea contului, înregistrările personale principale sunt eliminate, iar datele păstrate legitim sunt anonimizate ori reținute numai pe perioada obligatorie. Copiile tehnice de siguranță urmează ciclurile procesatorilor.",
      },
      {
        title: "7. Drepturile tale",
        body: "Poți solicita informare, acces, rectificare, ștergere, restricționare, opoziție, portabilitate și retragerea consimțământului, în condițiile legii. Poți depune o plângere la Centrul Național pentru Protecția Datelor cu Caracter Personal.",
      },
      {
        title: "8. AI și decizii automate",
        body: "Asistentul și recomandările pot procesa detaliile oferite de tine pentru a genera răspunsuri sau potriviri. Nu folosim aceste funcții pentru decizii exclusiv automate care produc efecte juridice. Nu introduce date sensibile care nu sunt necesare solicitării.",
      },
      {
        title: "9. Securitate și incidente",
        body: "Aplicăm control al accesului pe roluri, autentificare, validarea intrărilor, limitarea cererilor și jurnalizare tehnică. Incidentele sunt evaluate și, când legea o cere, sunt notificate autorității și persoanelor afectate.",
      },
      {
        title: "10. Cookies și actualizări",
        body: "Categoriile opționale sunt controlate separat în Politica Cookies. Putem actualiza această politică atunci când se schimbă funcțiile, procesatorii sau cadrul legal. Data actualizării este publicată la începutul paginii.",
      },
    ],
    accountPrefix: "Exportul și ștergerea sunt disponibile în",
    accountLink: "Cabinet, Datele mele",
    cookiesLink: "Politica Cookies",
  },
  ru: {
    home: "Главная",
    title: "Политика конфиденциальности",
    updated: "Последнее обновление: 31 июля 2026",
    metaTitle: "Конфиденциальность и персональные данные ePetrecere.md",
    metaDescription:
      "Узнайте, как ePetrecere.md собирает, использует и защищает персональные данные в Молдове и как реализовать свои права.",
    sections: [
      {
        title: "1. Оператор и область применения",
        body: "ePetrecere.md управляет платформой услуг для событий в Республике Молдова. Политика применяется к посетителям, клиентам, артистам, партнерам и представителям залов. По вопросам персональных данных пишите на privacy@epetrecere.md.",
      },
      {
        title: "2. Применимое законодательство",
        body: "До 22 августа 2026 года обработка соотносится с Законом № 133/2011. С 23 августа 2026 года применяется Закон № 195/2024 о защите персональных данных, который переносит нормы Регламента ЕС 2016/679. GDPR может применяться напрямую, когда платформа предлагает услуги субъектам данных из Европейского союза.",
      },
      {
        title: "3. Данные и цели",
        body: "Мы можем обрабатывать данные аккаунта и личности, сведения о событии, бюджете, гостях, запросах, бронированиях, сообщениях, отзывах, файлах, фотографиях и технические данные безопасности. Аналитические и маркетинговые данные используются только после согласия на соответствующую необязательную категорию.",
      },
      {
        title: "4. Правовые основания",
        body: "В зависимости от ситуации обработка основана на исполнении договора или действиях до его заключения, юридической обязанности, законном интересе в безопасности и предотвращении злоупотреблений либо согласии. Согласие можно отозвать без влияния на выполненную ранее обработку.",
      },
      {
        title: "5. Получатели и передача",
        body: "Данные не продаются. Они передаются поставщикам, когда вы создаете запрос или бронирование, и обработчикам, необходимым для входа, базы данных, хранения, электронной почты и функций AI. При обработке за пределами Молдовы используются договорные механизмы и подходящие меры защиты.",
      },
      {
        title: "6. Хранение и удаление",
        body: "Активные данные хранятся, пока аккаунту или событию необходим сервис. При удалении аккаунта основные персональные записи удаляются, а законно сохраняемые данные анонимизируются или остаются только на обязательный срок. Резервные копии следуют циклам обработчиков.",
      },
      {
        title: "7. Ваши права",
        body: "В предусмотренных законом случаях можно запросить информацию, доступ, исправление, удаление, ограничение, возражение, переносимость и отзыв согласия. Жалобу можно подать в Национальный центр защиты персональных данных.",
      },
      {
        title: "8. AI и автоматические решения",
        body: "Ассистент и рекомендации могут обрабатывать предоставленные вами сведения, чтобы создавать ответы или совпадения. Эти функции не используются для исключительно автоматических решений с юридическими последствиями. Не вводите чувствительные данные, которые не нужны для запроса.",
      },
      {
        title: "9. Безопасность и инциденты",
        body: "Мы применяем ролевой контроль доступа, аутентификацию, проверку входных данных, ограничение запросов и технические журналы. Инциденты оцениваются, а когда этого требует закон, о них уведомляются орган надзора и затронутые лица.",
      },
      {
        title: "10. Cookies и обновления",
        body: "Необязательные категории отдельно настраиваются в Политике cookies. Политика может обновляться при изменении функций, обработчиков или законодательства. Дата обновления указана в начале страницы.",
      },
    ],
    accountPrefix: "Экспорт и удаление доступны в разделе",
    accountLink: "Кабинет, Мои данные",
    cookiesLink: "Политика cookies",
  },
  en: {
    home: "Home",
    title: "Privacy Policy",
    updated: "Last updated: 31 July 2026",
    metaTitle: "Privacy and Personal Data at ePetrecere.md",
    metaDescription:
      "Learn how ePetrecere.md collects, uses and protects personal data in Moldova and how you can exercise your rights.",
    sections: [
      {
        title: "1. Controller and scope",
        body: "ePetrecere.md operates an event services platform in the Republic of Moldova. This policy applies to visitors, clients, artists, partners and venue representatives. Contact privacy@epetrecere.md for personal data requests.",
      },
      {
        title: "2. Applicable legal framework",
        body: "Until 22 August 2026, processing is assessed under Law No. 133/2011. From 23 August 2026, Law No. 195/2024 on personal data protection applies and transposes the framework of EU Regulation 2016/679. The GDPR may apply directly when the platform offers services to data subjects in the European Union.",
      },
      {
        title: "3. Data and purposes",
        body: "We may process account and identity data, event details, budget, guests, enquiries, bookings, messages, reviews, files, photographs and technical security data. Analytics and marketing data are used only when the relevant optional category has been accepted.",
      },
      {
        title: "4. Legal bases",
        body: "Depending on the context, processing relies on contract performance or requested pre-contract steps, legal obligation, legitimate interest in security and abuse prevention, or consent. Consent can be withdrawn without affecting processing already completed.",
      },
      {
        title: "5. Recipients and transfers",
        body: "Personal data is not sold. It is shared with suppliers when you start an enquiry or booking and with processors required for authentication, databases, storage, email and AI features. Processing outside Moldova uses contractual mechanisms and safeguards suitable for the situation.",
      },
      {
        title: "6. Retention and deletion",
        body: "Active data is kept while the account or event requires the service. When an account is deleted, primary personal records are removed, while lawfully retained data is anonymized or kept only for a mandatory period. Technical backups follow processor deletion cycles.",
      },
      {
        title: "7. Your rights",
        body: "Subject to legal conditions, you may request information, access, correction, deletion, restriction, objection, portability and withdrawal of consent. You may also complain to the National Centre for Personal Data Protection.",
      },
      {
        title: "8. AI and automated decisions",
        body: "The assistant and recommendations may process details you provide to generate answers or matches. These features are not used for solely automated decisions with legal effects. Do not enter sensitive data that is unnecessary for your request.",
      },
      {
        title: "9. Security and incidents",
        body: "We apply role-based access control, authentication, input validation, rate limiting and technical logging. Incidents are assessed and, where required by law, reported to the authority and affected individuals.",
      },
      {
        title: "10. Cookies and updates",
        body: "Optional categories are controlled separately in the Cookie Policy. This policy may be updated when features, processors or the legal framework change. The revision date is shown at the top of the page.",
      },
    ],
    accountPrefix: "Export and deletion are available in",
    accountLink: "Account, My data",
    cookiesLink: "Cookie Policy",
  },
} as const;

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();
  const labels = copy[locale];
  return generateMeta({
    title: labels.metaTitle,
    description: labels.metaDescription,
    path: "/confidentialitate",
    locale,
  });
}

export default async function PrivacyPage() {
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
      <p className="mt-2 text-sm text-muted-foreground">{labels.updated}</p>

      <div className="mt-8 space-y-7 text-sm leading-relaxed">
        {labels.sections.map((section, index) => (
          <section key={section.title}>
            <h2 className="font-heading text-xl font-semibold">{section.title}</h2>
            <p className="mt-2 text-muted-foreground">
              {section.body}
              {index === 6 && (
                <>
                  {" "}{labels.accountPrefix}{" "}
                  <Link href="/cabinet/date" className="text-gold underline">
                    {labels.accountLink}
                  </Link>.
                </>
              )}
              {index === 9 && (
                <>
                  {" "}<Link href="/cookies" className="text-gold underline">
                    {labels.cookiesLink}
                  </Link>.
                </>
              )}
            </p>
          </section>
        ))}
      </div>
    
      <div className="mt-8 rounded-xl border border-gold/30 bg-gold/5 p-4 text-sm">
        <p className="font-semibold">Pachetul legal complet</p>
        <p className="mt-1 text-muted-foreground">
          Acordurile pentru parteneri și locații, regulile marketplace, tarifele și
          politicile de recenzii, anti-fraudă și calitate sunt disponibile în română și
          rusă la <Link href="/legal" className="text-gold hover:underline">Documente legale</Link>.
        </p>
      </div>
    </div>
  );
}
