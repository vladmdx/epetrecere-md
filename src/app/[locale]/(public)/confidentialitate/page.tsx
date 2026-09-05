import type { Metadata } from "next";
import Link from "@/components/shared/locale-link";
import { generateMeta } from "@/lib/seo/generate-meta";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/routing";
import { t } from "@/i18n";

const copy = {
  ro: {
    home: "Acasă",
    title: "Politica de Confidențialitate",
    updated: "Ultima actualizare: 5 septembrie 2026",
    metaTitle: "Confidențialitate și date personale ePetrecere.md",
    metaDescription:
      "Află cum ePetrecere.md colectează, folosește și protejează datele personale în Moldova și cum îți poți exercita drepturile.",
    sections: [
      {
        title: "1. Operator și domeniu de aplicare",
        body: "Operatorul datelor este Societatea cu Răspundere Limitată „EPETRECERE” (EPETRECERE S.R.L.), IDNO 1026023123354, cu sediul în MD-3701, or. Strășeni, str. Mihai Eminescu 64, of. 6, Republica Moldova, care operează platforma ePetrecere.md. Politica se aplică vizitatorilor, clienților, artiștilor, partenerilor și reprezentanților sălilor. Pentru solicitări privind datele personale ne poți contacta la privacy@epetrecere.md.",
      },
      {
        title: "2. Cadrul legal aplicabil",
        body: "Până la 22 august 2026, prelucrarea este raportată la Legea nr. 133/2011. Din 23 august 2026 se aplică Legea nr. 195/2024 privind protecția datelor cu caracter personal, care transpune cadrul Regulamentului UE 2016/679. GDPR se poate aplica direct când platforma oferă servicii persoanelor vizate din Uniunea Europeană.",
      },
      {
        title: "3. Date și scopuri",
        body: "Putem prelucra date de cont și identitate, detalii despre eveniment, buget, invitați, cereri, rezervări, mesaje, recenzii, fișiere, fotografii și date tehnice de securitate. Când semnezi electronic documentele platformei, păstrăm în plus numele semnatarului, imaginea semnăturii desenate, adresa IP, șirul user-agent al dispozitivului, data și ora și amprenta SHA-256 a textului care ți-a fost afișat; aceste date sunt păstrate strict ca dovadă a acceptării contractului. Datele de analytics și marketing sunt folosite numai când categoria opțională corespunzătoare a fost acceptată.",
      },
      {
        title: "4. Temeiuri",
        body: "Prelucrarea se bazează, după caz, pe executarea contractului sau pe pașii ceruți înainte de contract, obligația legală, interesul legitim pentru securitate și prevenirea abuzului ori consimțământul. Consimțământul poate fi retras fără a afecta prelucrarea realizată anterior.",
      },
      {
        title: "5. Destinatari și transferuri",
        body: "Datele nu sunt vândute. În funcție de funcția folosită, procesatorii noștri sunt Clerk pentru autentificare, Neon pentru baza de date, Vercel și Vercel Blob pentru găzduire și fișiere, Cloudflare și R2 pentru securitate și stocare, Upstash pentru limitarea abuzurilor, Resend pentru email, Sentry pentru diagnosticarea erorilor, OpenAI și Anthropic pentru funcții AI, Google Maps pentru hărți și Meta pentru mesajele WhatsApp solicitate. Furnizorii evenimentului primesc date numai când inițiezi o cerere sau rezervare și nu primesc lista nominală a invitaților. Prelucrarea în afara Republicii Moldova este limitată la serviciul necesar și se bazează pe garanțiile contractuale și mecanismele de transfer permise de lege.",
      },
      {
        title: "6. Păstrare și ștergere",
        body: "Lista nominală a invitaților și răspunsurile RSVP sunt șterse automat la 90 de zile după eveniment. Fotografiile Moments și identificatorii aferenți sunt șterși la 180 de zile după eveniment sau, pentru galeriile fără dată, la 180 de zile după încărcare. Solicitările de contact fără relație contractuală se păstrează maximum 24 de luni; mesajele și rezervările se păstrează maximum 36 de luni după finalizarea relației, dacă nu există litigiu ori obligație legală. Dovezile contractelor și evidențele financiar-contabile se păstrează pe perioada cerută de lege și pentru apărarea drepturilor. Datele active de cont se păstrează până la ștergerea contului. Datele eliminate din sistemele active pot rămâne temporar în copiile de siguranță până la expirarea ciclului tehnic al procesatorului și nu sunt restaurate în utilizarea curentă.",
      },
      {
        title: "7. Drepturile tale",
        body: "Poți solicita informare, acces, rectificare, ștergere, restricționare, opoziție, portabilitate și retragerea consimțământului, în condițiile legii. Poți depune o plângere la Centrul Național pentru Protecția Datelor cu Caracter Personal.",
      },
      {
        title: "8. AI și decizii automate",
        body: "Asistentul și recomandările transmit textul necesar către OpenAI sau Anthropic, în funcție de disponibilitate. Istoricul asistentului public rămâne în localStorage pe dispozitiv, iar endpointul ePetrecere nu creează un dosar persistent al conversației. Furnizorul AI poate păstra jurnale de siguranță până la 30 de zile conform setărilor API; datele API nu sunt folosite pentru antrenare implicită. Nu folosim funcțiile AI pentru decizii exclusiv automate cu efect juridic și nu trebuie introduse date sensibile ori datele altor persoane.",
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
    updated: "Последнее обновление: 5 сентября 2026 года",
    metaTitle: "Конфиденциальность и персональные данные ePetrecere.md",
    metaDescription:
      "Узнайте, как ePetrecere.md собирает, использует и защищает персональные данные в Молдове и как реализовать свои права.",
    sections: [
      {
        title: "1. Оператор и область применения",
        body: "Оператором данных является Societatea cu Răspundere Limitată «EPETRECERE» (EPETRECERE S.R.L.), IDNO 1026023123354, юридический адрес: MD-3701, г. Стрэшень, ул. Михай Еминеску, 64, оф. 6, Республика Молдова, которое управляет платформой ePetrecere.md. Политика применяется к посетителям, клиентам, артистам, партнерам и представителям залов. По вопросам персональных данных пишите на privacy@epetrecere.md.",
      },
      {
        title: "2. Применимое законодательство",
        body: "До 22 августа 2026 года обработка соотносится с Законом № 133/2011. С 23 августа 2026 года применяется Закон № 195/2024 о защите персональных данных, который переносит нормы Регламента ЕС 2016/679. GDPR может применяться напрямую, когда платформа предлагает услуги субъектам данных из Европейского союза.",
      },
      {
        title: "3. Данные и цели",
        body: "Мы можем обрабатывать данные аккаунта и личности, сведения о событии, бюджете, гостях, запросах, бронированиях, сообщениях, отзывах, файлах, фотографиях и технические данные безопасности. Когда вы подписываете документы платформы электронно, мы дополнительно храним имя подписанта, изображение нарисованной подписи, IP-адрес, строку user-agent устройства, дату и время и отпечаток SHA-256 показанного вам текста; эти данные хранятся строго как доказательство принятия договора. Аналитические и маркетинговые данные используются только после согласия на соответствующую необязательную категорию.",
      },
      {
        title: "4. Правовые основания",
        body: "В зависимости от ситуации обработка основана на исполнении договора или действиях до его заключения, юридической обязанности, законном интересе в безопасности и предотвращении злоупотреблений либо согласии. Согласие можно отозвать без влияния на выполненную ранее обработку.",
      },
      {
        title: "5. Получатели и передача",
        body: "Данные не продаются. В зависимости от функции обработчиками являются Clerk (вход), Neon (база данных), Vercel и Vercel Blob (хостинг и файлы), Cloudflare и R2 (безопасность и хранение), Upstash (защита от злоупотреблений), Resend (email), Sentry (диагностика), OpenAI и Anthropic (AI), Google Maps (карты) и Meta (заказанные сообщения WhatsApp). Поставщики мероприятия получают данные только после запроса или бронирования и не получают именной список гостей. Передача за пределы Молдовы ограничена необходимым сервисом и опирается на договорные гарантии и разрешенные законом механизмы.",
      },
      {
        title: "6. Хранение и удаление",
        body: "Именные списки гостей и RSVP удаляются через 90 дней после события. Фото Moments и связанные идентификаторы удаляются через 180 дней после события или загрузки для галереи без даты. Контактные обращения без договора хранятся не более 24 месяцев; сообщения и бронирования не более 36 месяцев после завершения отношений, если нет спора или юридической обязанности. Договорные и финансовые доказательства хранятся в установленный законом срок. Данные аккаунта хранятся до его удаления. Удаленные активные данные могут временно оставаться в резервных копиях до завершения технического цикла поставщика и не возвращаются в обычное использование.",
      },
      {
        title: "7. Ваши права",
        body: "В предусмотренных законом случаях можно запросить информацию, доступ, исправление, удаление, ограничение, возражение, переносимость и отзыв согласия. Жалобу можно подать в Национальный центр защиты персональных данных.",
      },
      {
        title: "8. AI и автоматические решения",
        body: "Ассистент и рекомендации передают необходимый текст OpenAI или Anthropic в зависимости от доступности. История публичного чата остается в localStorage на устройстве, а endpoint ePetrecere не создает постоянное досье разговора. AI-поставщик может хранить журналы безопасности до 30 дней согласно API-настройкам; API-данные по умолчанию не используются для обучения. AI не принимает исключительно автоматические решения с юридическими последствиями. Не вводите чувствительные данные или данные других лиц.",
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
    updated: "Last updated: 5 September 2026",
    metaTitle: "Privacy and Personal Data at ePetrecere.md",
    metaDescription:
      "Learn how ePetrecere.md collects, uses and protects personal data in Moldova and how you can exercise your rights.",
    sections: [
      {
        title: "1. Controller and scope",
        body: "The data controller is Societatea cu Răspundere Limitată “EPETRECERE” (EPETRECERE S.R.L.), IDNO 1026023123354, registered at MD-3701, Strășeni, str. Mihai Eminescu 64, of. 6, Republic of Moldova, which operates the ePetrecere.md platform. This policy applies to visitors, clients, artists, partners and venue representatives. Contact privacy@epetrecere.md for personal data requests.",
      },
      {
        title: "2. Applicable legal framework",
        body: "Until 22 August 2026, processing is assessed under Law No. 133/2011. From 23 August 2026, Law No. 195/2024 on personal data protection applies and transposes the framework of EU Regulation 2016/679. The GDPR may apply directly when the platform offers services to data subjects in the European Union.",
      },
      {
        title: "3. Data and purposes",
        body: "We may process account and identity data, event details, budget, guests, enquiries, bookings, messages, reviews, files, photographs and technical security data. When you sign the platform's documents electronically, we additionally keep the signatory's name, the image of the drawn signature, the IP address, the device user-agent string, the date and time and the SHA-256 fingerprint of the text that was displayed to you; this data is kept strictly as proof that the contract was accepted. Analytics and marketing data are used only when the relevant optional category has been accepted.",
      },
      {
        title: "4. Legal bases",
        body: "Depending on the context, processing relies on contract performance or requested pre-contract steps, legal obligation, legitimate interest in security and abuse prevention, or consent. Consent can be withdrawn without affecting processing already completed.",
      },
      {
        title: "5. Recipients and transfers",
        body: "Personal data is not sold. Depending on the feature used, our processors are Clerk for authentication, Neon for the database, Vercel and Vercel Blob for hosting and files, Cloudflare and R2 for security and storage, Upstash for abuse prevention, Resend for email, Sentry for error diagnostics, OpenAI and Anthropic for AI, Google Maps for maps, and Meta for requested WhatsApp messages. Event suppliers receive data only when you start an enquiry or booking and never receive the named guest list. Processing outside Moldova is limited to the necessary service and relies on contractual safeguards and transfer mechanisms permitted by law.",
      },
      {
        title: "6. Retention and deletion",
        body: "Named guest lists and RSVP responses are deleted 90 days after the event. Moments photos and related identifiers are deleted 180 days after the event or, for an undated gallery, 180 days after upload. Contact enquiries without a contract are kept for no more than 24 months; messages and bookings for no more than 36 months after the relationship ends, unless a dispute or legal duty applies. Contract evidence and financial records are kept for the legally required period. Active account data is kept until account deletion. Data removed from active systems may remain temporarily in backups until the processor's technical rotation ends and is not restored into ordinary use.",
      },
      {
        title: "7. Your rights",
        body: "Subject to legal conditions, you may request information, access, correction, deletion, restriction, objection, portability and withdrawal of consent. You may also complain to the National Centre for Personal Data Protection.",
      },
      {
        title: "8. AI and automated decisions",
        body: "The assistant and recommendations send the necessary text to OpenAI or Anthropic, depending on availability. Public-chat history remains in localStorage on the device and the ePetrecere endpoint does not create a persistent conversation file. The AI provider may retain safety logs for up to 30 days under its API settings; API data is not used for training by default. AI is not used for solely automated decisions with legal effect. Do not enter sensitive data or another person's data.",
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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  const labels = copy[locale];
  return generateMeta({
    title: labels.metaTitle,
    description: labels.metaDescription,
    path: "/confidentialitate",
    locale,
  });
}

export default async function PrivacyPage({
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
      <p className="mt-2 text-sm text-muted-foreground">{labels.updated}</p>

      <div className="mt-8 space-y-7 text-sm leading-relaxed">
        {labels.sections.map((section, index) => (
          <section
            key={section.title}
            id={index === 5 ? "liste-invitati" : undefined}
            className="scroll-mt-28"
          >
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
        <p className="font-semibold">{t("privacy.legalPack.title", locale)}</p>
        <p className="mt-1 text-muted-foreground">
          {t("privacy.legalPack.body", locale)}{" "}
          <Link href="/legal" className="text-gold hover:underline">{t("footer.legalDocs", locale)}</Link>.
        </p>
      </div>
    </div>
  );
}
