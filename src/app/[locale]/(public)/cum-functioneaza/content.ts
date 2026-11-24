import type { AppLocale } from "@/lib/i18n/routing";

export type GuideStepId = "plan" | "requests" | "dashboard" | "confirm" | "checklist";

type GuideStepCopy = {
  title: string;
  description: string;
  points?: readonly string[];
  imageAlt: string;
  caption: string;
};

type GuideCopy = {
  pageTitle: string;
  metaDescription: string;
  headline: string;
  headlineAccent: string;
  intro: string;
  startPlanning: string;
  readGuide: string;
  openCabinet: string;
  openBookings: string;
  openImage: string;
  demo: string;
  planningTitle: string;
  organizationTitle: string;
  statuses: readonly [
    { title: string; description: string },
    { title: string; description: string },
    { title: string; description: string },
  ];
  venueConfirmation: string;
  finishTitle: string;
  finishDescription: string;
  steps: Record<GuideStepId, GuideStepCopy>;
};

export const guideCopy: Record<AppLocale, GuideCopy> = {
  ro: {
    pageTitle: "Cum funcționează",
    metaDescription: "Vezi cum creezi un plan de eveniment, ceri oferte de la săli și artiști, confirmi rezervările și organizezi invitații din Panoul Meu.",
    headline: "Planifică-ți evenimentul,",
    headlineAccent: "pas cu pas.",
    intro: "Pe ePetrecere găsești săli, artiști și servicii pentru evenimente în Moldova. Pornești de la data și locul evenimentului, trimiți cereri furnizorilor pe care îi alegi și urmărești totul din Panoul Meu.",
    startPlanning: "Începe să planifici",
    readGuide: "Vezi pașii",
    openCabinet: "Deschide Panoul Meu",
    openBookings: "Vezi Rezervările Mele",
    openImage: "Mărește captura",
    demo: "Date demonstrative",
    planningTitle: "De la idee la primele cereri",
    organizationTitle: "Cum gestionezi evenimentul din Panoul Meu",
    statuses: [
      { title: "În așteptare", description: "Ai trimis cererea și aștepți răspunsul." },
      { title: "Acceptat de partener", description: "Verifici oferta și decizi dacă o confirmi." },
      { title: "Confirmat", description: "Rezervarea este finalizată." },
    ],
    venueConfirmation: "Pentru o sală, după ce accepți oferta, aștepți și confirmarea finală a locației.",
    finishTitle: "Gata să începi planul?",
    finishDescription: "Alege tipul evenimentului și data. Poți reveni în Panoul Meu pe măsură ce răspund furnizorii.",
    steps: {
      plan: {
        title: "Creează planul în 7 pași",
        description: "Apasă „Planifică” și pornește de la detaliile pe care le știi deja.",
        points: [
          "Alege tipul evenimentului, data, ora, localitatea și numărul estimat de invitați.",
          "Spune dacă ai nevoie de sală și ce servicii cauți, de exemplu DJ, fotograf sau moderator.",
          "Alege instrumentele pe care vrei să le folosești, dă un nume evenimentului și autentifică-te pentru a salva planul.",
        ],
        imageAlt: "Formularul de planificare cu pașii pentru dată, invitați, sală și servicii.",
        caption: "Planificatorul de evenimente",
      },
      requests: {
        title: "Alege furnizorii și trimite cereri",
        description: "După salvare, ajungi în planul tău. În „Săli” și „Rezervări Artiști” vezi opțiunile potrivite evenimentului. Deschide profilurile, compară ofertele și trimite cereri furnizorilor pe care îi alegi.",
        points: [
          "La o locație cu mai multe săli, alege sala pentru care vrei să trimiți cererea.",
          "Pentru un artist, apasă „Solicită rezervare” și verifică data, intervalul și tariful înainte de a trimite cererea.",
        ],
        imageAlt: "Fila de rezervare a artiștilor cu furnizori de comparat și butoane pentru cereri.",
        caption: "Rezervări Artiști în planul evenimentului",
      },
      dashboard: {
        title: "Revino oricând la evenimentul tău",
        description: "În „Panoul Meu” găsești evenimentul activ, cererile în așteptare și mesajele. Apasă „Vezi planul meu” ca să treci între săli, artiști și instrumentele de organizare pe care le-ai activat.",
        imageAlt: "Panoul clientului cu evenimentul activ, progresul, cererile în așteptare și mesajele.",
        caption: "Evenimentul activ în Panoul Meu",
      },
      confirm: {
        title: "Urmărește răspunsurile și confirmă rezervările",
        description: "În „Rezervările Mele” vezi starea fiecărei cereri. Folosește mesajele pentru a discuta tariful, programul și detaliile cu furnizorul. Dacă partenerul a acceptat cererea și oferta îți convine, apasă „Confirmă”.",
        imageAlt: "Rezervările Mele cu un fotograf confirmat, o ofertă acceptată și o cerere în așteptare.",
        caption: "Statusurile din Rezervările Mele",
      },
      checklist: {
        title: "Pregătește ultimele detalii",
        description: "După ce ai rezervările confirmate pentru sala și artiștii aleși, folosește checklistul ca să bifezi ce ai rezolvat. Cu instrumentele activate, poți crea invitații electronice, urmări răspunsurile invitaților și organiza așezarea la mese.",
        imageAlt: "Checklistul evenimentului demonstrativ, cu toate sarcinile bifate și progres de 100%.",
        caption: "Checklistul de organizare al evenimentului",
      },
    },
  },
  ru: {
    pageTitle: "Как это работает",
    metaDescription: "Узнайте, как создать план мероприятия, отправить запросы площадкам и артистам, подтвердить бронирования и организовать список гостей.",
    headline: "Спланируйте мероприятие",
    headlineAccent: "шаг за шагом.",
    intro: "На ePetrecere вы найдёте площадки, артистов и другие услуги для мероприятий в Молдове. Укажите дату и место, отправьте запросы выбранным исполнителям и следите за подготовкой в личном кабинете.",
    startPlanning: "Начать планирование",
    readGuide: "Посмотреть шаги",
    openCabinet: "Открыть личный кабинет",
    openBookings: "Открыть мои бронирования",
    openImage: "Увеличить изображение",
    demo: "Пример интерфейса на румынском",
    planningTitle: "От идеи до первых запросов",
    organizationTitle: "Как управлять мероприятием в личном кабинете",
    statuses: [
      { title: "В ожидании", description: "Запрос отправлен. Вы ждёте ответа." },
      { title: "Принято партнёром", description: "Проверьте предложение и решите, подходит ли оно вам." },
      { title: "Подтверждено", description: "Бронирование оформлено." },
    ],
    venueConfirmation: "После принятия предложения по залу дождитесь окончательного подтверждения от площадки.",
    finishTitle: "Готовы начать планирование?",
    finishDescription: "Выберите тип мероприятия и дату. Возвращайтесь в личный кабинет, чтобы следить за ответами исполнителей.",
    steps: {
      plan: {
        title: "Создайте план за 7 шагов",
        description: "Нажмите «Планировать» и начните с тех деталей, которые уже известны.",
        points: [
          "Укажите тип мероприятия, дату, время, населённый пункт и примерное число гостей.",
          "Отметьте, нужен ли зал, и выберите услуги, например диджея, фотографа или ведущего.",
          "Выберите инструменты для подготовки, дайте мероприятию название и войдите в аккаунт, чтобы сохранить план.",
        ],
        imageAlt: "Форма планирования с шагами для даты, гостей, зала и услуг.",
        caption: "Планировщик мероприятий",
      },
      requests: {
        title: "Выберите исполнителей и отправьте запросы",
        description: "После сохранения откроется ваш план. Во вкладках «Залы» и «Бронирование артистов» найдите варианты для вашего мероприятия. Откройте профили, сравните предложения и отправьте запросы выбранным исполнителям.",
        points: [
          "Если у площадки несколько залов, выберите тот, на который хотите отправить запрос.",
          "Чтобы отправить запрос артисту, нажмите кнопку запроса бронирования и проверьте дату, время и тариф.",
        ],
        imageAlt: "Вкладка бронирования артистов с карточками исполнителей и кнопками запроса.",
        caption: "Бронирование артистов в плане мероприятия",
      },
      dashboard: {
        title: "Возвращайтесь к мероприятию в любое время",
        description: "В личном кабинете видны текущее мероприятие, запросы в ожидании и сообщения. Откройте свой план, чтобы перейти к залам, артистам и выбранным инструментам подготовки.",
        imageAlt: "Личный кабинет с активным мероприятием, ходом подготовки, запросами в ожидании и сообщениями.",
        caption: "Активное мероприятие в личном кабинете",
      },
      confirm: {
        title: "Следите за ответами и подтверждайте бронирования",
        description: "В разделе «Мои бронирования» виден статус каждого запроса. Обсудите цену, время и детали в сообщениях. Когда партнёр примет запрос, нажмите «Подтвердить», если предложение вам подходит.",
        imageAlt: "Мои бронирования с подтверждённым фотографом, принятым предложением и запросом в ожидании.",
        caption: "Статусы в разделе «Мои бронирования»",
      },
      checklist: {
        title: "Завершите подготовку",
        description: "Когда зал и выбранные артисты подтверждены, отметьте выполненные задачи в чеклисте. Включённые инструменты помогут создать электронные приглашения, собрать ответы и распределить гостей по столам.",
        imageAlt: "Чеклист примера мероприятия со всеми выполненными задачами и прогрессом 100%.",
        caption: "Чеклист подготовки мероприятия",
      },
    },
  },
  en: {
    pageTitle: "How it works",
    metaDescription: "Learn how to create an event plan, request quotes from venues and artists, confirm bookings and manage your guests in your dashboard.",
    headline: "Plan your event",
    headlineAccent: "step by step.",
    intro: "ePetrecere brings together venues, artists and event services in Moldova. Start with your date and location, send requests to the providers you choose and track the details in your dashboard.",
    startPlanning: "Start planning",
    readGuide: "See the steps",
    openCabinet: "Open my dashboard",
    openBookings: "View my bookings",
    openImage: "Enlarge screenshot",
    demo: "Example shown in Romanian",
    planningTitle: "From an idea to your first requests",
    organizationTitle: "Manage your event from your dashboard",
    statuses: [
      { title: "Pending", description: "You sent the request and are waiting for a reply." },
      { title: "Accepted by provider", description: "Review the offer and decide whether to confirm it." },
      { title: "Confirmed", description: "The booking is complete." },
    ],
    venueConfirmation: "For a venue booking, the venue gives final confirmation after you accept the offer.",
    finishTitle: "Ready to start planning?",
    finishDescription: "Choose an event type and date. Come back to your dashboard to follow provider replies.",
    steps: {
      plan: {
        title: "Create your plan in 7 steps",
        description: "Select “Plan” and start with the details you already know.",
        points: [
          "Choose the event type, date, time, town and estimated guest count.",
          "Say whether you need a venue and choose services such as a DJ, photographer or host.",
          "Select the tools you want to use, name your event and sign in to save your plan.",
        ],
        imageAlt: "The planning form with steps for the date, guests, venue and services.",
        caption: "Event planner",
      },
      requests: {
        title: "Choose your providers and send requests",
        description: "After saving, your plan opens. Browse the Venues and Artist Bookings tabs for options that suit your event. View profiles, compare offers and send requests to providers you are interested in.",
        points: [
          "If a venue has more than one hall, pick the one you want to request.",
          "Choose Request booking for an artist and check the date, hours and rate before sending.",
        ],
        imageAlt: "Artist booking tab with provider cards to compare and buttons for requests.",
        caption: "Artist bookings in your event plan",
      },
      dashboard: {
        title: "Return to your event at any time",
        description: "Your dashboard shows the active event, pending requests and messages. Open your event plan to switch between venues, artists and the planning tools you enabled.",
        imageAlt: "Client dashboard with an active event, planning progress, pending requests and messages.",
        caption: "Active event in the client dashboard",
      },
      confirm: {
        title: "Follow the replies and confirm your bookings",
        description: "In My Bookings you can see the status of every request. Use messages to discuss the price, schedule and details. Once the provider accepts the request, select Confirm if you are happy with the offer.",
        imageAlt: "My Bookings with a confirmed photographer, an accepted offer and a pending request.",
        caption: "Statuses in My Bookings",
      },
      checklist: {
        title: "Finish the remaining details",
        description: "Once your venue and chosen artists are confirmed, use the checklist to tick off what you have done. The tools you enabled can help you send digital invitations, track guest replies and arrange the seating.",
        imageAlt: "The sample event checklist with every task checked and progress at 100%.",
        caption: "Event planning checklist",
      },
    },
  },
};
