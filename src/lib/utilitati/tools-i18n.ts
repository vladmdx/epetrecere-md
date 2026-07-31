import type { Locale } from "@/types";
import type { ToolDef } from "@/lib/utilitati/tools";

type LocalizedToolContent = Pick<
  ToolDef,
  "title" | "metaTitle" | "metaDescription" | "shortPitch" | "features" | "seoBody" | "imageAlt"
>;

const en: Record<string, LocalizedToolContent> = {
  checklist: {
    title: "Event Checklist",
    metaTitle: "Wedding and Event Checklist Online in Moldova",
    metaDescription: "Plan a wedding or event in Moldova with a structured online checklist, automatic deadlines and shared progress.",
    shortPitch: "Keep every task, deadline and responsibility in one clear event checklist.",
    features: ["Ready-made tasks for weddings and other events", "Automatic deadlines based on the event date", "Shared progress for the couple or planning team", "Categories for venues, artists, decor and logistics", "Notifications for important deadlines"],
    seoBody: `## A practical wedding checklist for Moldova

A large event involves dozens of dependent decisions. The online checklist keeps venue, music, photo, decor, documents and guest tasks in one timeline.

## How to use it

- Choose the event type and date
- Review the suggested tasks
- Assign responsibilities
- Add your own tasks and notes
- Complete items as planning progresses

## Key planning periods

Start venue and core supplier research 9 to 14 months ahead. Confirm invitations and visual direction 3 to 6 months ahead. Close the guest list, menu and supplier schedule during the final 4 to 8 weeks.

## Why a shared checklist helps

Both partners see the same status, deadlines and decisions. This reduces duplicate work and keeps important details from staying only in messages or paper notes.`,
    imageAlt: "Online wedding and event checklist for Moldova",
  },
  budget: {
    title: "Budget and Expenses",
    metaTitle: "Online Wedding Budget Planner for Moldova",
    metaDescription: "Track estimated and actual wedding expenses by category in Chișinău and Moldova, with progress and export.",
    shortPitch: "Compare estimated and actual event costs by category and keep every payment visible.",
    features: ["Total budget and category allocations", "Estimated and actual expenses", "Clear remaining balance", "Warnings when a category approaches its limit", "Export for personal records"],
    seoBody: `## Keep the wedding budget under control

Deposits, balances and small additions are easy to lose across conversations. A digital budget gives every cost a category, amount, currency and due date.

## Recommended categories

- Venue, menu and drinks
- Music and entertainment
- Photo and video
- Decor and flowers
- Attire and rings
- Transport, documents and logistics

## A healthier 2026 budget

Set a maximum amount without relying on guest gifts. Keep 10% to 15% as a contingency and compare the complete cost of each offer, not only its headline price.

## Update it after every decision

Record both the estimate and the signed amount. Add the deposit and remaining payment separately so the cash flow before the event stays clear.`,
    imageAlt: "Online wedding budget and expense planner for Moldova",
  },
  "invitatii-electronice": {
    title: "Electronic Invitations",
    metaTitle: "Electronic Wedding Invitations and RSVP in Moldova",
    metaDescription: "Create electronic invitations for weddings and events in Moldova, share a link and collect RSVP responses online.",
    shortPitch: "Create a shareable event invitation and collect guest confirmations in one place.",
    features: ["Designs for weddings, baptisms and corporate events", "Custom text, image and colors", "Shareable link for messaging apps", "Online RSVP tracking", "Event map and practical details"],
    seoBody: `## Electronic invitations for a 2026 event

An electronic invitation is quick to update, easy to share and useful for guests living outside Moldova. It can combine the invitation, map, schedule and RSVP form.

## Information to include

- Hosts and event type
- Date and start time
- Venue name and map
- Dress code or practical notes
- RSVP deadline and contact

## Better RSVP tracking

Each answer updates the guest list, which makes follow-up and seating preparation easier. Keep a clear deadline 6 to 8 weeks before the event.

## Accessible on any phone

Guests open the invitation in a browser without installing an app. Prepare Romanian, Russian or English copy when the guest list is multilingual.`,
    imageAlt: "Electronic wedding invitation with online RSVP in Moldova",
  },
  "lista-invitati": {
    title: "Guest List and Seating",
    metaTitle: "Wedding Guest List and Seating Planner Moldova",
    metaDescription: "Manage RSVPs, guest details and table seating for a wedding or event in Moldova.",
    shortPitch: "Track every guest, confirmation and table assignment from one organized list.",
    features: ["Guest contact and RSVP status", "Groups for family, friends and colleagues", "Allergies and accessibility notes", "Visual table assignments", "Final lists for the venue team"],
    seoBody: `## One reliable guest list

A central guest list prevents different versions from circulating between the couple, family and venue. Each person can have a group, RSVP status, companion and practical notes.

## Information worth tracking

- Name and contact channel
- Invited, confirmed or declined status
- Companion and children
- Food allergies and accessibility needs
- Table assignment

## Build the seating plan

Group guests by relationships, but check comfort and accessibility too. Keep children, older guests and speakers in suitable areas. Leave a small amount of flexibility until the venue confirms the final layout.

## Share the final version

Export a clear alphabetical list and a list by table for reception and service staff.`,
    imageAlt: "Online wedding guest list and table seating planner",
  },
  "momente-eveniment": {
    title: "Event Moments",
    metaTitle: "Private Guest Photo Gallery for Weddings in Moldova",
    metaDescription: "Collect guest photos in a private event gallery through a link or QR code, without requiring an app.",
    shortPitch: "Collect guest photos in one private gallery through a simple link or QR code.",
    features: ["Upload from any phone browser", "Private event link", "Live gallery updates", "Moderation and reveal controls", "Download collected memories"],
    seoBody: `## Collect the moments guests see

Guests often capture candid perspectives that the official team cannot cover. Event Moments brings those photographs into one private gallery.

## How it works

- Create the event gallery
- Share its link or QR code
- Guests upload from their browser
- Moderate or reveal photographs
- Download the final collection

## Privacy controls

Use a private link, explain who can view the gallery and avoid posting images publicly without the people’s permission. Remove any upload that should not remain in the collection.

## Useful for more than weddings

The gallery also works for baptisms, birthdays, company events and family celebrations across Moldova.`,
    imageAlt: "Private wedding guest photo gallery with QR upload",
  },
};

const ru: Record<string, LocalizedToolContent> = {
  checklist: {
    title: "Чеклист события",
    metaTitle: "Онлайн чеклист свадьбы и события в Молдове",
    metaDescription: "Организуйте свадьбу или событие в Молдове с готовыми задачами, сроками и общим прогрессом.",
    shortPitch: "Храните задачи, сроки и ответственность в одном понятном чеклисте.",
    features: ["Готовые задачи для свадьбы и других событий", "Сроки от даты события", "Общий прогресс пары или команды", "Категории для зала, артистов и логистики", "Напоминания о важных сроках"],
    seoBody: `## Практический чеклист свадьбы в Молдове

Большое событие включает десятки зависимых решений. Онлайн чеклист объединяет зал, музыку, фото, декор, документы и гостей в одном плане.

## Как пользоваться

- Выберите тип и дату события
- Проверьте предложенные задачи
- Назначьте ответственных
- Добавьте свои пункты и заметки
- Отмечайте выполненное

## Основные периоды

Зал и ключевых поставщиков лучше искать за 9 - 14 месяцев. Приглашения и стиль готовят за 3 - 6 месяцев. В последние 4 - 8 недель закрывают список гостей, меню и программу поставщиков.

## Зачем нужен общий чеклист

Оба партнера видят одинаковые сроки и решения, поэтому важные детали не теряются в сообщениях и бумажных заметках.`,
    imageAlt: "Онлайн чеклист свадьбы и события в Молдове",
  },
  budget: {
    title: "Бюджет и расходы",
    metaTitle: "Онлайн бюджет свадьбы в Молдове",
    metaDescription: "Сравнивайте плановые и фактические расходы свадьбы по категориям в Кишиневе и Молдове.",
    shortPitch: "Сравнивайте плановые и фактические расходы и контролируйте каждый платеж.",
    features: ["Общий бюджет и категории", "Плановые и фактические расходы", "Остаток бюджета", "Предупреждения о лимитах", "Экспорт для личного учета"],
    seoBody: `## Контролируйте бюджет свадьбы

Авансы, остатки и небольшие дополнения легко теряются в переписке. Цифровой бюджет сохраняет категорию, сумму, валюту и срок каждого платежа.

## Основные категории

- Зал, меню и напитки
- Музыка и развлечения
- Фото и видео
- Декор и цветы
- Наряды и кольца
- Транспорт, документы и логистика

## Устойчивый бюджет 2026

Определите максимум без расчета на подарки. Оставьте резерв 10% - 15% и сравнивайте полную стоимость предложения.

## Обновляйте после каждого решения

Записывайте оценку и сумму договора. Аванс и остаток храните отдельно, чтобы видеть платежи до события.`,
    imageAlt: "Онлайн бюджет и расходы свадьбы в Молдове",
  },
  "invitatii-electronice": {
    title: "Электронные приглашения",
    metaTitle: "Электронные приглашения на свадьбу в Молдове",
    metaDescription: "Создайте электронное приглашение, поделитесь ссылкой и собирайте RSVP онлайн.",
    shortPitch: "Создайте ссылку приглашения и собирайте подтверждения гостей в одном месте.",
    features: ["Дизайны для разных событий", "Текст, изображение и цвета", "Ссылка для мессенджеров", "Онлайн RSVP", "Карта и детали события"],
    seoBody: `## Электронные приглашения в 2026 году

Электронное приглашение легко обновить и отправить гостям в Молдове и за рубежом. В нем можно объединить карту, программу и форму RSVP.

## Что добавить

- Имена организаторов
- Дату и время
- Название зала и карту
- Дресс-код
- Срок RSVP и контакт

## Удобные подтверждения

Ответы обновляют список гостей. Установите понятный срок за 6 - 8 недель до события.

## Доступ с телефона

Гости открывают ссылку без приложения. Для смешанной аудитории подготовьте версии на румынском, русском или английском.`,
    imageAlt: "Электронное приглашение на свадьбу с онлайн RSVP",
  },
  "lista-invitati": {
    title: "Список гостей и рассадка",
    metaTitle: "Список гостей и рассадка на свадьбу в Молдове",
    metaDescription: "Управляйте RSVP, данными гостей и рассадкой для свадьбы или события.",
    shortPitch: "Храните гостей, подтверждения и столы в одном организованном списке.",
    features: ["Контакты и RSVP", "Группы гостей", "Аллергии и доступность", "Распределение по столам", "Финальные списки для зала"],
    seoBody: `## Один надежный список гостей

Центральный список предотвращает появление разных версий у пары, семьи и зала. У каждого гостя есть группа, статус, сопровождающий и заметки.

## Что сохранить

- Имя и контакт
- Статус приглашения
- Сопровождающий и дети
- Аллергии и доступность
- Номер стола

## Рассадка

Учитывайте отношения, комфорт и доступность. Оставьте небольшую гибкость до подтверждения финальной схемы зала.

## Финальная версия

Подготовьте алфавитный список и список по столам для администрации и официантов.`,
    imageAlt: "Список гостей и план рассадки на свадьбу",
  },
  "momente-eveniment": {
    title: "Моменты события",
    metaTitle: "Приватная галерея фото гостей на свадьбе",
    metaDescription: "Собирайте фото гостей в приватной галерее по ссылке или QR коду без установки приложения.",
    shortPitch: "Соберите фотографии гостей в приватной галерее по ссылке или QR коду.",
    features: ["Загрузка из браузера телефона", "Приватная ссылка", "Обновление галереи", "Модерация и открытие", "Скачивание коллекции"],
    seoBody: `## Соберите моменты глазами гостей

Гости снимают искренние моменты, которых может не быть у официальной команды. Все фотографии попадают в одну приватную галерею.

## Как это работает

- Создайте галерею
- Поделитесь ссылкой или QR кодом
- Гости загружают фото
- Проверьте и откройте материалы
- Скачайте коллекцию

## Конфиденциальность

Используйте приватную ссылку и объясните, кто видит галерею. Не публикуйте людей открыто без разрешения.

## Для разных событий

Инструмент подходит для свадеб, крестин, дней рождения и корпоративных мероприятий.`,
    imageAlt: "Приватная галерея свадебных фото гостей",
  },
};

export function localizeTool(tool: ToolDef, locale: Locale): ToolDef {
  if (locale === "ro") return tool;
  const localized = (locale === "ru" ? ru : en)[tool.slug];
  return localized ? { ...tool, ...localized } : tool;
}
